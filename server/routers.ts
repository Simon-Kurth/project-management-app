import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { initiateDuoAuth, completeDuoCallback, isDuoConfigured, duoHealthCheck } from "./duo";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import {
  createDemoUser,
  getAuditLogs,
  getConnectorConfigs,
  getLatestComputedKPIs,
  getUserByEmail,
  getUserById,
  listAllUsers,
  updateUserRole,
  toggleUserActive,
  getAuditLogsForUser,
  seedConnectors,
  writeAuditLog,
} from "./db";
import { runJiraSync } from "./scheduler";
import { JiraConnector } from "./connectors/jira";
import { mockData, connectorStubs } from "./mockData";

// ─── RBAC Helpers ─────────────────────────────────────────────────────────────
//
// Role tier map:
//   executive      → all 9 tabs
//   admin          → all 9 tabs (same as executive for data access)
//   company        → all 9 tabs (legacy — kept for backwards compat)
//   qa             → QA tab only
//   sales_marketing → Sales + Marketing tabs only
//   csm            → CSM tab only

type AppRole = "user" | "admin" | "executive" | "company" | "qa" | "sales_marketing" | "csm";

// Tabs each role can access
const TAB_ACCESS: Record<AppRole, string[]> = {
  executive:       ["executive-summary", "financials", "delivery", "development", "it-ops", "qa", "csm", "sales", "marketing"],
  admin:           ["executive-summary", "financials", "delivery", "development", "it-ops", "qa", "csm", "sales", "marketing"],
  company:         ["executive-summary", "financials", "delivery", "development", "it-ops", "qa", "csm", "sales", "marketing"],
  qa:              ["qa"],
  sales_marketing: ["sales", "marketing"],
  csm:             ["csm"],
  user:            [],
};

function canAccess(role: string, tab: string): boolean {
  return (TAB_ACCESS[role as AppRole] ?? []).includes(tab);
}

function requireTab(role: string, tab: string) {
  if (!canAccess(role, tab)) {
    throw new TRPCError({ code: "FORBIDDEN", message: `Role '${role}' cannot access the '${tab}' tab.` });
  }
}

// Convenience guards for grouped access
function requireExecutive(role: string) { requireTab(role, "executive-summary"); }
function requireUserManagement(role: string) {
  if (role !== "executive" && role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: `Role '${role}' cannot access user management.` });
  }
}
function requireQA(role: string)        { requireTab(role, "qa"); }
function requireCSM(role: string)       { requireTab(role, "csm"); }
function requireSales(role: string)     { requireTab(role, "sales"); }
function requireMarketing(role: string) { requireTab(role, "marketing"); }

// ─── App Router ───────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  // ── Auth ──────────────────────────────────────────────────────────────────
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),

    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),

    // Password-based login for demo users
    loginWithPassword: publicProcedure
      .input(z.object({ email: z.string().email(), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const ip = ctx.req.headers["x-forwarded-for"]?.toString() || ctx.req.socket?.remoteAddress || "unknown";
        const ua = ctx.req.headers["user-agent"] || "unknown";

        const user = await getUserByEmail(input.email);
        if (!user || !user.isActive || !user.passwordHash) {
          await writeAuditLog({ userEmail: input.email, action: "LOGIN_FAILED", resource: "auth", ipAddress: ip, userAgent: ua, metadata: { reason: "user_not_found" } });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        }

        const valid = await bcrypt.compare(input.password, user.passwordHash);
        if (!valid) {
          await writeAuditLog({ userId: user.id, userEmail: user.email ?? undefined, action: "LOGIN_FAILED", resource: "auth", ipAddress: ip, userAgent: ua, metadata: { reason: "wrong_password" } });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid credentials" });
        }

        // ── Duo Universal Prompt MFA ──────────────────────────────────────────
        // If Duo is configured, always require Duo 2FA after password validation.
        // If Duo is NOT configured (dev/test), skip MFA and create session directly.
        if (isDuoConfigured()) {
          await writeAuditLog({ userId: user.id, userEmail: user.email ?? undefined, action: "LOGIN_DUO_INITIATED", resource: "auth", ipAddress: ip, userAgent: ua });

          // Generate Duo auth URL — stores state in DB for CSRF validation
          const duoAuthUrl = await initiateDuoAuth(user.id, user.email ?? user.openId);

          return {
            requiresDuo: true,
            duoAuthUrl,
            userId: user.id,
            user: null,
          };
        }

        // Duo not configured — create session directly (dev/test mode)
        await writeAuditLog({ userId: user.id, userEmail: user.email ?? undefined, action: "LOGIN_SUCCESS", resource: "auth", ipAddress: ip, userAgent: ua });

        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? user.email ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: 8 * 60 * 60 * 1000,
        });

        return {
          requiresDuo: false,
          duoAuthUrl: null,
          userId: user.id,
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        };
      }),

    // ── Duo Callback ─────────────────────────────────────────────────────────
    // Called by the frontend after Duo redirects back to /duo-callback.
    // Validates the state token, exchanges the duo_code, and creates a session.
    duoCallback: publicProcedure
      .input(z.object({
        state:   z.string().min(1),
        duoCode: z.string().min(1),
      }))
      .mutation(async ({ input, ctx }) => {
        const ip = ctx.req.headers["x-forwarded-for"]?.toString() || "unknown";
        const ua = ctx.req.headers["user-agent"] || "unknown";

        let callbackResult;
        try {
          callbackResult = await completeDuoCallback(input.state, input.duoCode);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Duo verification failed";
          await writeAuditLog({ action: "DUO_CALLBACK_FAILED", resource: "auth", ipAddress: ip, userAgent: ua, metadata: { error: msg } });
          throw new TRPCError({ code: "UNAUTHORIZED", message: msg });
        }

        const user = await getUserById(callbackResult.userId);
        if (!user || !user.isActive) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found or inactive" });
        }

        await writeAuditLog({ userId: user.id, userEmail: user.email ?? undefined, action: "LOGIN_SUCCESS_DUO", resource: "auth", ipAddress: ip, userAgent: ua });

        // Create signed session cookie
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? user.email ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: 8 * 60 * 60 * 1000,
        });

        return {
          user: { id: user.id, email: user.email, name: user.name, role: user.role },
        };
      }),

    // ── Duo Health Check ─────────────────────────────────────────────────────
    duoStatus: publicProcedure.query(async () => {
      return await duoHealthCheck();
    }),
  }),

  // ── Seed (run once to create demo users) ──────────────────────────────────
  seed: router({
    runSeed: publicProcedure.mutation(async () => {
      const execHash = await bcrypt.hash("Executive@2024!", 12);
      const compHash = await bcrypt.hash("Company@2024!", 12);

      const qaHash     = await bcrypt.hash("QA@2024!", 12);
      const smHash     = await bcrypt.hash("SalesMarketing@2024!", 12);
      const csmHash    = await bcrypt.hash("CSM@2024!", 12);

      await createDemoUser({ email: "executive@demo.com",     passwordHash: execHash, name: "Alexandra Chen",    role: "executive" });
      await createDemoUser({ email: "company@demo.com",       passwordHash: compHash, name: "Marcus Thompson",   role: "company" });
      await createDemoUser({ email: "qa@demo.com",            passwordHash: qaHash,   name: "Jordan Lee",        role: "qa" });
      await createDemoUser({ email: "salesmarketing@demo.com",passwordHash: smHash,   name: "Taylor Rivera",     role: "sales_marketing" });
      await createDemoUser({ email: "csm@demo.com",           passwordHash: csmHash,  name: "Casey Morgan",      role: "csm" });
      await seedConnectors();

      return { success: true, message: "Demo users seeded: executive, company, qa, sales_marketing, csm." };
    }),
  }),

  // ── Dashboard — Executive + Company tabs ──────────────────────────────────
  dashboard: router({
    executiveSummary: protectedProcedure.query(async ({ ctx }) => {
      requireExecutive(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "executive-summary" });
      return mockData.executiveSummary;
    }),

    financials: protectedProcedure.query(async ({ ctx }) => {
      requireExecutive(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "financials" });
      return mockData.financials;
    }),

    delivery: protectedProcedure.query(async ({ ctx }) => {
      requireExecutive(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "delivery" });

      // Use live Jira KPIs if available, fall back to mock data gracefully
      const boardId = process.env.JIRA_BOARD_ID;
      const liveKpis = boardId ? await getLatestComputedKPIs(boardId, "delivery") : null;

      if (liveKpis) {
        // Merge live velocity + burndown into the mock structure
        // Only the fields we have live data for are replaced
        return {
          ...mockData.delivery,
          velocityTrend: liveKpis.velocity.map((v) => ({
            sprint: v.sprint,
            committed: v.committed,
            completed: v.completed,
          })),
          burndown: liveKpis.burndown,
          activeSprintName: liveKpis.activeSprint?.name ?? null,
          dataSource: "jira" as const,
          lastSyncedAt: liveKpis.computedAt,
        };
      }

      return { ...mockData.delivery, dataSource: "mock" as const };
    }),

    development: protectedProcedure.query(async ({ ctx }) => {
      requireExecutive(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "development" });

      // Use live Jira KPIs if available, fall back to mock data gracefully
      const boardId = process.env.JIRA_BOARD_ID;
      const liveKpis = boardId ? await getLatestComputedKPIs(boardId, "delivery") : null;

      if (liveKpis) {
        return {
          ...mockData.development,
          cycleTimeMedian: liveKpis.cycleTime.median,
          cycleTimeP75: liveKpis.cycleTime.p75,
          cycleTimeP95: liveKpis.cycleTime.p95,
          deploymentFrequencyData: liveKpis.deploymentFrequency,
          throughput: liveKpis.throughput,
          bugs: liveKpis.bugs,
          dataSource: "jira" as const,
          lastSyncedAt: liveKpis.computedAt,
        };
      }

      return { ...mockData.development, dataSource: "mock" as const };
    }),

    // Admin-only: force an immediate Jira sync without waiting for the scheduler
    forceJiraSync: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin" && ctx.user.role !== "company") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
      }
      const connector = new JiraConnector();
      if (!connector.isConfigured()) {
        return { success: false, message: "Jira not configured. Set JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_BOARD_ID, JIRA_PROJECT_KEY in Secrets." };
      }
      return runJiraSync();
    }),

    // Return Jira connector status (configured / last sync time)
    jiraStatus: protectedProcedure.query(async ({ ctx }) => {
      requireExecutive(ctx.user.role);
      const connector = new JiraConnector();
      const boardId = process.env.JIRA_BOARD_ID ?? "";
      const latest = boardId ? await getLatestComputedKPIs(boardId, "delivery") : null;
      return {
        configured: connector.isConfigured(),
        boardId,
        lastSyncedAt: latest?.computedAt ?? null,
        dataSource: latest ? "jira" : "mock",
      };
    }),

    itops: protectedProcedure.query(async ({ ctx }) => {
      requireExecutive(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "itops" });
      return mockData.itops;
    }),

    // ── Company-only tabs ────────────────────────────────────────────────────
    qa: protectedProcedure.query(async ({ ctx }) => {
      requireQA(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "qa" });
      return mockData.qa;
    }),

    csm: protectedProcedure.query(async ({ ctx }) => {
      requireCSM(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "csm" });
      return mockData.csm;
    }),

    sales: protectedProcedure.query(async ({ ctx }) => {
      requireSales(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "sales" });
      return mockData.sales;
    }),

    marketing: protectedProcedure.query(async ({ ctx }) => {
      requireMarketing(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "marketing" });
      return mockData.marketing;
    }),

    // ── Audit log viewer (company/admin only) ────────────────────────────────
    auditLogs: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
      .query(async ({ input, ctx }) => {
        requireExecutive(ctx.user.role);
        return getAuditLogs(input.limit);
      }),

    // ── Connector configs ────────────────────────────────────────────────────
    connectors: protectedProcedure.query(async ({ ctx }) => {
      requireExecutive(ctx.user.role);
      const dbConfigs = await getConnectorConfigs();
      return { configs: dbConfigs, stubs: connectorStubs };
    }),
  }),

  // ── User Management (Executive / Admin only) ──────────────────────────────
  users: router({
    // List all users with their role, last login, and MFA status
    list: protectedProcedure.query(async ({ ctx }) => {
      requireUserManagement(ctx.user.role);
      const allUsers = await listAllUsers();
      const duoConfigured = isDuoConfigured();
      return allUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        loginMethod: u.loginMethod,
        isActive: u.isActive,
        lastSignedIn: u.lastSignedIn,
        createdAt: u.createdAt,
        // MFA status: if Duo is configured, all password users go through Duo.
        // If Duo is not configured, MFA is bypassed for everyone.
        mfaStatus: duoConfigured ? "duo_active" : "bypassed",
      }));
    }),

    // Update a user's role (cannot demote yourself)
    updateRole: protectedProcedure
      .input(z.object({
        userId: z.number(),
        role: z.enum(["executive", "company", "qa", "sales_marketing", "csm", "admin", "user"]),
      }))
      .mutation(async ({ input, ctx }) => {
        requireUserManagement(ctx.user.role);
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot change your own role." });
        }
        await updateUserRole(input.userId, input.role);
        await writeAuditLog({
          userId: ctx.user.id,
          userEmail: ctx.user.email ?? undefined,
          action: "USER_ROLE_CHANGED",
          resource: "users",
          resourceId: String(input.userId),
          metadata: { newRole: input.role },
        });
        return { success: true };
      }),

    // Activate or deactivate a user account
    toggleActive: protectedProcedure
      .input(z.object({ userId: z.number(), isActive: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        requireUserManagement(ctx.user.role);
        if (input.userId === ctx.user.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot deactivate your own account." });
        }
        await toggleUserActive(input.userId, input.isActive);
        await writeAuditLog({
          userId: ctx.user.id,
          userEmail: ctx.user.email ?? undefined,
          action: input.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
          resource: "users",
          resourceId: String(input.userId),
        });
        return { success: true };
      }),

    // Get the audit trail for a specific user (last 20 actions)
    auditTrail: protectedProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input, ctx }) => {
        requireUserManagement(ctx.user.role);
        return getAuditLogsForUser(input.userId, 20);
      }),
  }),
});

export type AppRouter = typeof appRouter;
