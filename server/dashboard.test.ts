import { describe, expect, it, beforeAll, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

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

function makeUserCtx(role: "executive" | "company" | "admin"): TrpcContext {
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
  it("returns user data for valid executive credentials", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.loginWithPassword({
      email: "executive@demo.com",
      password: "Executive@2024!",
    });
    expect(result.requiresMfa).toBe(false);
    expect(result.user?.role).toBe("executive");
    expect(result.user?.email).toBe("executive@demo.com");
  });

  it("returns user data for valid company credentials", async () => {
    const caller = appRouter.createCaller(makePublicCtx());
    const result = await caller.auth.loginWithPassword({
      email: "company@demo.com",
      password: "Company@2024!",
    });
    expect(result.requiresMfa).toBe(false);
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

  it("CANNOT access qa (company-only)", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    await expect(caller.dashboard.qa()).rejects.toThrow("Company access required");
  });

  it("CANNOT access csm (company-only)", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    await expect(caller.dashboard.csm()).rejects.toThrow("Company access required");
  });

  it("CANNOT access sales (company-only)", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    await expect(caller.dashboard.sales()).rejects.toThrow("Company access required");
  });

  it("CANNOT access marketing (company-only)", async () => {
    const caller = appRouter.createCaller(makeUserCtx("executive"));
    await expect(caller.dashboard.marketing()).rejects.toThrow("Company access required");
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
