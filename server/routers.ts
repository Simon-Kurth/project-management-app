import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import {
  createDemoUser,
  getAuditLogs,
  getConnectorConfigs,
  getUserByEmail,
  getUserById,
  seedConnectors,
  updateUserMfa,
  writeAuditLog,
} from "./db";
import { mockData, connectorStubs } from "./mockData";

// ─── RBAC Helpers ─────────────────────────────────────────────────────────────

const EXECUTIVE_ROLES = ["executive", "company", "admin"] as const;
const COMPANY_ROLES = ["company", "admin"] as const;

function requireExecutive(role: string) {
  if (!EXECUTIVE_ROLES.includes(role as (typeof EXECUTIVE_ROLES)[number])) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Executive access required" });
  }
}

function requireCompany(role: string) {
  if (!COMPANY_ROLES.includes(role as (typeof COMPANY_ROLES)[number])) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Company access required" });
  }
}

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

        // If MFA is enabled and verified, require TOTP step
        if (user.mfaEnabled && user.mfaVerified) {
          await writeAuditLog({ userId: user.id, userEmail: user.email ?? undefined, action: "LOGIN_MFA_REQUIRED", resource: "auth", ipAddress: ip, userAgent: ua });
          return {
            requiresMfa: true,
            userId: user.id,
            user: null,
          };
        }

        await writeAuditLog({ userId: user.id, userEmail: user.email ?? undefined, action: "LOGIN_SUCCESS", resource: "auth", ipAddress: ip, userAgent: ua });

        // Create a signed session cookie so protectedProcedure can authenticate subsequent requests
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? user.email ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: 8 * 60 * 60 * 1000, // 8 hours
        });

        return {
          requiresMfa: false,
          userId: user.id,
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            mfaEnabled: user.mfaEnabled,
          },
        };
      }),

    // Verify TOTP code during login
    verifyMfaLogin: publicProcedure
      .input(z.object({ userId: z.number(), code: z.string().length(6) }))
      .mutation(async ({ input, ctx }) => {
        const ip = ctx.req.headers["x-forwarded-for"]?.toString() || "unknown";
        const ua = ctx.req.headers["user-agent"] || "unknown";

        const user = await getUserById(input.userId);
        if (!user || !user.mfaSecret) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid session" });
        }

        const totp = new OTPAuth.TOTP({
          issuer: "ExecDashboard",
          label: user.email ?? "user",
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
        });

        const delta = totp.validate({ token: input.code, window: 1 });
        if (delta === null) {
          await writeAuditLog({ userId: user.id, action: "MFA_VERIFY_FAILED", resource: "auth", ipAddress: ip, userAgent: ua });
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid MFA code" });
        }

        await writeAuditLog({ userId: user.id, action: "LOGIN_SUCCESS_MFA", resource: "auth", ipAddress: ip, userAgent: ua });

        // Create signed session cookie after successful MFA
        const sessionToken = await sdk.createSessionToken(user.openId, { name: user.name ?? user.email ?? "" });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: 8 * 60 * 60 * 1000,
        });

        return {
          user: { id: user.id, email: user.email, name: user.name, role: user.role, mfaEnabled: user.mfaEnabled },
        };
      }),

    // Generate MFA secret and QR code for enrollment
    setupMfa: protectedProcedure.mutation(async ({ ctx }) => {
      const secret = new OTPAuth.Secret({ size: 20 });
      const totp = new OTPAuth.TOTP({
        issuer: "ExecDashboard",
        label: ctx.user.email ?? "user",
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret,
      });

      await updateUserMfa(ctx.user.id, { mfaSecret: secret.base32, mfaEnabled: false, mfaVerified: false });

      const qrCodeUrl = await QRCode.toDataURL(totp.toString());
      return { qrCodeUrl, secret: secret.base32 };
    }),

    // Confirm MFA enrollment with a valid TOTP code
    confirmMfa: protectedProcedure
      .input(z.object({ code: z.string().length(6) }))
      .mutation(async ({ input, ctx }) => {
        const user = await getUserById(ctx.user.id);
        if (!user?.mfaSecret) throw new TRPCError({ code: "BAD_REQUEST", message: "MFA not set up" });

        const totp = new OTPAuth.TOTP({
          issuer: "ExecDashboard",
          label: user.email ?? "user",
          algorithm: "SHA1",
          digits: 6,
          period: 30,
          secret: OTPAuth.Secret.fromBase32(user.mfaSecret),
        });

        const delta = totp.validate({ token: input.code, window: 1 });
        if (delta === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid code" });

        await updateUserMfa(ctx.user.id, { mfaEnabled: true, mfaVerified: true });
        await writeAuditLog({ userId: ctx.user.id, action: "MFA_ENABLED", resource: "auth" });
        return { success: true };
      }),

    // Disable MFA
    disableMfa: protectedProcedure.mutation(async ({ ctx }) => {
      await updateUserMfa(ctx.user.id, { mfaEnabled: false, mfaVerified: false, mfaSecret: undefined });
      await writeAuditLog({ userId: ctx.user.id, action: "MFA_DISABLED", resource: "auth" });
      return { success: true };
    }),
  }),

  // ── Seed (run once to create demo users) ──────────────────────────────────
  seed: router({
    runSeed: publicProcedure.mutation(async () => {
      const execHash = await bcrypt.hash("Executive@2024!", 12);
      const compHash = await bcrypt.hash("Company@2024!", 12);

      await createDemoUser({ email: "executive@demo.com", passwordHash: execHash, name: "Alexandra Chen", role: "executive" });
      await createDemoUser({ email: "company@demo.com", passwordHash: compHash, name: "Marcus Thompson", role: "company" });
      await seedConnectors();

      return { success: true, message: "Demo users and connectors seeded." };
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
      return mockData.delivery;
    }),

    development: protectedProcedure.query(async ({ ctx }) => {
      requireExecutive(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "development" });
      return mockData.development;
    }),

    itops: protectedProcedure.query(async ({ ctx }) => {
      requireExecutive(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "itops" });
      return mockData.itops;
    }),

    // ── Company-only tabs ────────────────────────────────────────────────────
    qa: protectedProcedure.query(async ({ ctx }) => {
      requireCompany(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "qa" });
      return mockData.qa;
    }),

    csm: protectedProcedure.query(async ({ ctx }) => {
      requireCompany(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "csm" });
      return mockData.csm;
    }),

    sales: protectedProcedure.query(async ({ ctx }) => {
      requireCompany(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "sales" });
      return mockData.sales;
    }),

    marketing: protectedProcedure.query(async ({ ctx }) => {
      requireCompany(ctx.user.role);
      await writeAuditLog({ userId: ctx.user.id, userEmail: ctx.user.email ?? undefined, action: "TAB_VIEW", resource: "dashboard", resourceId: "marketing" });
      return mockData.marketing;
    }),

    // ── Audit log viewer (company/admin only) ────────────────────────────────
    auditLogs: protectedProcedure
      .input(z.object({ limit: z.number().min(1).max(500).default(100) }))
      .query(async ({ input, ctx }) => {
        requireCompany(ctx.user.role);
        return getAuditLogs(input.limit);
      }),

    // ── Connector configs ────────────────────────────────────────────────────
    connectors: protectedProcedure.query(async ({ ctx }) => {
      requireCompany(ctx.user.role);
      const dbConfigs = await getConnectorConfigs();
      return { configs: dbConfigs, stubs: connectorStubs };
    }),
  }),
});

export type AppRouter = typeof appRouter;
