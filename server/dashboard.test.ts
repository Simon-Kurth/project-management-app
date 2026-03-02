import { describe, expect, it, beforeAll, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

// Mock Duo so tests don't need real Duo credentials — isDuoConfigured returns false in test env
vi.mock("./duo", () => ({
  isDuoConfigured: vi.fn(() => false),
  initiateDuoAuth: vi.fn(async () => "https://duo.example.com/auth"),
  completeDuoCallback: vi.fn(async () => ({ userId: 1, username: "executive@demo.com" })),
  duoHealthCheck: vi.fn(async () => ({ ok: true, message: "Duo servers reachable" })),
}));

vi.mock("./db", () => ({
  getUserByEmail: vi.fn(async (email: string) => {
    if (email === "executive@demo.com") {
      return {
        id: 1,
        email: "executive@demo.com",
        name: "Alexandra Chen",
        role: "executive",
        passwordHash: "$2a$12$placeholder",
        isActive: true,
        mfaEnabled: false,
        mfaVerified: false,
        mfaSecret: null,
      };
    }
    if (email === "company@demo.com") {
      return {
        id: 2,
        email: "company@demo.com",
        name: "Marcus Thompson",
        role: "company",
        passwordHash: "$2a$12$placeholder",
        isActive: true,
        mfaEnabled: false,
        mfaVerified: false,
        mfaSecret: null,
      };
    }
    return null;
  }),
  getUserById: vi.fn(async (id: number) => {
    if (id === 1) return { id: 1, email: "executive@demo.com", name: "Alexandra Chen", role: "executive", mfaEnabled: false, mfaVerified: false, mfaSecret: null, isActive: true };
    if (id === 2) return { id: 2, email: "company@demo.com", name: "Marcus Thompson", role: "company", mfaEnabled: false, mfaVerified: false, mfaSecret: null, isActive: true };
    return null;
  }),
  writeAuditLog: vi.fn(async () => {}),
  createDemoUser: vi.fn(async () => {}),
  seedConnectors: vi.fn(async () => {}),
  getAuditLogs: vi.fn(async () => []),
  getConnectorConfigs: vi.fn(async () => []),
  updateUserMfa: vi.fn(async () => {}),
  upsertUser: vi.fn(async () => {}),
  getUserByOpenId: vi.fn(async () => undefined),
  listAllUsers: vi.fn(async () => [
    { id: 1, name: "Alexandra Chen", email: "executive@demo.com", role: "executive", loginMethod: "password", isActive: true, lastSignedIn: new Date(), createdAt: new Date() },
    { id: 2, name: "Marcus Thompson", email: "company@demo.com", role: "company", loginMethod: "password", isActive: true, lastSignedIn: new Date(), createdAt: new Date() },
  ]),
  updateUserRole: vi.fn(async () => {}),
  toggleUserActive: vi.fn(async () => {}),
  getAuditLogsForUser: vi.fn(async () => []),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(async (plain: string, _hash: string) => {
      // Accept correct passwords for testing
      if (plain === "Executive@2024!" || plain === "Company@2024!") return true;
      return false;
    }),
    hash: vi.fn(async (plain: string) => `$2a$12$hashed_${plain}`),
  },
  compare: vi.fn(async (plain: string, _hash: string) => {
    if (plain === "Executive@2024!" || plain === "Company@2024!") return true;
    return false;
  }),
  hash: vi.fn(async (plain: string) => `$2a$12$hashed_${plain}`),
}));

// ─── Context Factories ────────────────────────────────────────────────────────

function makePublicCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {}, socket: { remoteAddress: "127.0.0.1" } } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function makeUserCtx(role: "executive" | "company" | "admin" | "qa" | "sales_marketing" | "csm"): TrpcContext {
  return {
    user: {
      id: role === "executive" ? 1 : 2,
      openId: `openid_${role}`,
      email: `${role}@demo.com`,
      name: role === "executive" ? "Alexandra Chen" : "Marcus Thompson",
      loginMethod: "password",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {}, socket: { remoteAddress: "127.0.0.1" } } as unknown as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Auth Tests ───────────────────────────────────────────────────────────────

describe("auth.loginWithPassword", () => {
  it("returns user data for valid executive credentials (Duo bypassed in test)", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.loginWithPassword({
      email: "executive@demo.com",
      password: "Executive@2024!",
    });
    // Duo not configured in test env — session created directly
    expect(result.requiresDuo).toBe(false);
    expect(result.user?.role).toBe("executive");
    expect(result.user?.email).toBe("executive@demo.com");
  });

  it("returns user data for valid company credentials (Duo bypassed in test)", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.loginWithPassword({
      email: "company@demo.com",
      password: "Company@2024!",
    });
    expect(result.requiresDuo).toBe(false);
    expect(result.user?.role).toBe("company");
  });

  it("throws UNAUTHORIZED for wrong password", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.auth.loginWithPassword({ email: "executive@demo.com", password: "wrongpassword" })
    ).rejects.toThrow("Invalid credentials");
  });

  it("throws UNAUTHORIZED for unknown email", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(
      caller.auth.loginWithPassword({ email: "unknown@example.com", password: "any" })
    ).rejects.toThrow("Invalid credentials");
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const ctx = makePublicCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

// ─── RBAC Tests ───────────────────────────────────────────────────────────────

describe("dashboard RBAC — Executive role", () => {
  it("can access executiveSummary", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.executiveSummary();
    expect(data).toBeDefined();
    expect(Array.isArray(data.kpis)).toBe(true);
    expect(data.kpis.length).toBeGreaterThan(0);
  });

  it("can access financials", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.financials();
    expect(data).toBeDefined();
    expect(Array.isArray(data.kpis)).toBe(true);
  });

  it("can access delivery", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.delivery();
    expect(data).toBeDefined();
    expect(Array.isArray(data.projects)).toBe(true);
  });

  it("can access development", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.development();
    expect(data).toBeDefined();
  });

  it("can access itops", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.itops();
    expect(data).toBeDefined();
  });

  // Executive now sees ALL 9 tabs
  it("CAN access qa (executive sees all tabs)", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.qa();
    expect(data).toBeDefined();
  });

  it("CAN access csm (executive sees all tabs)", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.csm();
    expect(data).toBeDefined();
  });

  it("CAN access sales (executive sees all tabs)", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.sales();
    expect(data).toBeDefined();
  });

  it("CAN access marketing (executive sees all tabs)", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.marketing();
    expect(data).toBeDefined();
  });

  // Granular role checks — QA role can only access QA
  it("qa role CANNOT access financials", async () => {
    const caller = appRouter.createCaller(makeUserCtx("qa"));
    await expect(caller.dashboard.financials()).rejects.toThrow("cannot access");
  });

  it("qa role CAN access qa tab", async () => {
    const caller = appRouter.createCaller(makeUserCtx("qa"));
    const data = await caller.dashboard.qa();
    expect(data).toBeDefined();
  });

  it("sales_marketing role CANNOT access financials", async () => {
    const caller = appRouter.createCaller(makeUserCtx("sales_marketing"));
    await expect(caller.dashboard.financials()).rejects.toThrow("cannot access");
  });

  it("sales_marketing role CAN access sales tab", async () => {
    const caller = appRouter.createCaller(makeUserCtx("sales_marketing"));
    const data = await caller.dashboard.sales();
    expect(data).toBeDefined();
  });

  it("csm role CANNOT access sales tab", async () => {
    const caller = appRouter.createCaller(makeUserCtx("csm"));
    await expect(caller.dashboard.sales()).rejects.toThrow("cannot access");
  });

  it("csm role CAN access csm tab", async () => {
    const caller = appRouter.createCaller(makeUserCtx("csm"));
    const data = await caller.dashboard.csm();
    expect(data).toBeDefined();
  });
});

describe("dashboard RBAC — Company role", () => {
  it("can access all 9 tabs", async () => {
    const caller = appRouter.createCaller(makeUserCtx("company"));
    const [exec, fin, del, dev, it, qa, csm, sales, mkt] = await Promise.all([
      caller.dashboard.executiveSummary(),
      caller.dashboard.financials(),
      caller.dashboard.delivery(),
      caller.dashboard.development(),
      caller.dashboard.itops(),
      caller.dashboard.qa(),
      caller.dashboard.csm(),
      caller.dashboard.sales(),
      caller.dashboard.marketing(),
    ]);
    expect(exec.kpis.length).toBeGreaterThan(0);
    expect(fin.kpis.length).toBeGreaterThan(0);
    expect(del.projects.length).toBeGreaterThan(0);
    expect(dev.kpis.length).toBeGreaterThan(0);
    expect(it.kpis.length).toBeGreaterThan(0);
    expect(qa.kpis.length).toBeGreaterThan(0);
    expect(csm.kpis.length).toBeGreaterThan(0);
    expect(sales.kpis.length).toBeGreaterThan(0);
    expect(mkt.kpis.length).toBeGreaterThan(0);
  });
});

describe("dashboard RBAC — unauthenticated", () => {
  it("cannot access any dashboard tab without auth", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.dashboard.executiveSummary()).rejects.toThrow();
    await expect(caller.dashboard.qa()).rejects.toThrow();
  });
});

// ─── Mock Data Tests ──────────────────────────────────────────────────────────

describe("mock data completeness", () => {
  it("executive summary has all required fields", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.executiveSummary();
    expect(data.kpis).toBeDefined();
    expect(data.revenueVsTarget).toBeDefined();
    expect(data.alerts).toBeDefined();
    expect(data.headcountByDept).toBeDefined();
    expect(data.departmentHealth).toBeDefined();
  });

  it("financials has revenue, expense, and cash flow data", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.financials();
    expect(data.monthlyRevenue).toBeDefined();
    expect(data.revenueByProduct).toBeDefined();
    expect(data.expenseBreakdown).toBeDefined();
    expect(data.cashFlow).toBeDefined();
  });

  it("delivery has projects and velocity data", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    const data = await caller.dashboard.delivery();
    expect(data.projects.length).toBeGreaterThan(0);
    expect(data.velocityTrend).toBeDefined();
    expect(data.deliveryByTeam).toBeDefined();
  });

  it("qa has test results and defect data", async () => {
    const caller = appRouter.createCaller(makeUserCtx("company"));
    const data = await caller.dashboard.qa();
    expect(data.testResults.length).toBeGreaterThan(0);
    expect(data.defectTrend).toBeDefined();
    expect(data.defects).toBeDefined();
  });
});

// ─── User Management RBAC Tests ───────────────────────────────────────────────

describe("user management RBAC", () => {

  it("executive CAN call users.list", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    // Will throw if RBAC blocks it; mock returns empty array if DB not available
    await expect(caller.users.list()).resolves.toBeDefined();
  });

  it("company role CANNOT call users.list", async () => {
    const caller = appRouter.createCaller(makeUserCtx("company"));
    await expect(caller.users.list()).rejects.toThrow("cannot access user management");
  });

  it("qa role CANNOT call users.list", async () => {
    const caller = appRouter.createCaller(makeUserCtx("qa"));
    await expect(caller.users.list()).rejects.toThrow("cannot access");
  });

  it("executive CANNOT change their own role", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    // executive has id=1 in makeUserCtx
    await expect(caller.users.updateRole({ userId: 1, role: "company" })).rejects.toThrow(
      "cannot change your own role"
    );
  });

  it("executive CAN change another user's role", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    // userId 2 is a different user
    await expect(caller.users.updateRole({ userId: 2, role: "qa" })).resolves.toEqual({ success: true });
  });

  it("executive CANNOT deactivate their own account", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    await expect(caller.users.toggleActive({ userId: 1, isActive: false })).rejects.toThrow(
      "cannot deactivate your own account"
    );
  });

  it("unauthenticated user CANNOT access users.list", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    await expect(caller.users.list()).rejects.toThrow();
  });
});
