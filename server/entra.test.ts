/**
 * server/entra.test.ts
 * Unit tests for the Microsoft Entra ID OIDC integration module.
 *
 * These tests validate:
 *  - isEntraConfigured() returns false when env vars are absent
 *  - isEntraConfigured() returns true when all required env vars are set
 *  - mapEntraGroupsToRole() priority ordering
 *  - mapEntraGroupsToRole() defaults correctly when no group vars are set
 *  - mapEntraGroupsToRole() defaults to "user" when group vars are set but no match
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isEntraConfigured, mapEntraGroupsToRole } from "./entra";

// ─── isEntraConfigured ────────────────────────────────────────────────────────

describe("isEntraConfigured", () => {
  const REQUIRED_VARS = {
    ENTRA_TENANT_ID:     "test-tenant-id",
    ENTRA_CLIENT_ID:     "test-client-id",
    ENTRA_CLIENT_SECRET: "test-client-secret",
    ENTRA_REDIRECT_URI:  "https://wheelhouse.example.com/api/auth/entra/callback",
  };

  beforeEach(() => {
    // Clear all Entra env vars before each test
    Object.keys(REQUIRED_VARS).forEach((k) => delete process.env[k]);
  });

  afterEach(() => {
    Object.keys(REQUIRED_VARS).forEach((k) => delete process.env[k]);
  });

  it("returns false when no Entra env vars are set", () => {
    expect(isEntraConfigured()).toBe(false);
  });

  it("returns false when only some env vars are set", () => {
    process.env.ENTRA_CLIENT_ID = "test-client-id";
    process.env.ENTRA_TENANT_ID = "test-tenant-id";
    // Missing ENTRA_CLIENT_SECRET and ENTRA_REDIRECT_URI
    expect(isEntraConfigured()).toBe(false);
  });

  it("returns true when all required env vars are set", () => {
    Object.assign(process.env, REQUIRED_VARS);
    expect(isEntraConfigured()).toBe(true);
  });
});

// ─── mapEntraGroupsToRole ─────────────────────────────────────────────────────

describe("mapEntraGroupsToRole", () => {
  const GROUP_IDS = {
    admin:           "group-admin-guid",
    executive:       "group-exec-guid",
    company:         "group-company-guid",
    qa:              "group-qa-guid",
    sales_marketing: "group-sm-guid",
    csm:             "group-csm-guid",
  };

  beforeEach(() => {
    // Clear group env vars
    Object.keys(GROUP_IDS).forEach((role) => {
      const key = `ENTRA_GROUP_${role.toUpperCase()}`;
      delete process.env[key];
    });
  });

  afterEach(() => {
    Object.keys(GROUP_IDS).forEach((role) => {
      const key = `ENTRA_GROUP_${role.toUpperCase()}`;
      delete process.env[key];
    });
  });

  it("defaults to 'executive' when no group env vars are configured", () => {
    // No ENTRA_GROUP_* vars set → all Entra users get executive access
    const role = mapEntraGroupsToRole(["any-group-id"]);
    expect(role).toBe("executive");
  });

  it("defaults to 'user' when group vars are set but user is not in any group", () => {
    process.env.ENTRA_GROUP_EXECUTIVE = GROUP_IDS.executive;
    const role = mapEntraGroupsToRole(["unknown-group-id"]);
    expect(role).toBe("user");
  });

  it("maps admin group correctly", () => {
    process.env.ENTRA_GROUP_ADMIN = GROUP_IDS.admin;
    const role = mapEntraGroupsToRole([GROUP_IDS.admin]);
    expect(role).toBe("admin");
  });

  it("maps executive group correctly", () => {
    process.env.ENTRA_GROUP_EXECUTIVE = GROUP_IDS.executive;
    const role = mapEntraGroupsToRole([GROUP_IDS.executive]);
    expect(role).toBe("executive");
  });

  it("maps qa group correctly", () => {
    process.env.ENTRA_GROUP_QA = GROUP_IDS.qa;
    const role = mapEntraGroupsToRole([GROUP_IDS.qa]);
    expect(role).toBe("qa");
  });

  it("maps sales_marketing group correctly", () => {
    process.env.ENTRA_GROUP_SALES_MARKETING = GROUP_IDS.sales_marketing;
    const role = mapEntraGroupsToRole([GROUP_IDS.sales_marketing]);
    expect(role).toBe("sales_marketing");
  });

  it("maps csm group correctly", () => {
    process.env.ENTRA_GROUP_CSM = GROUP_IDS.csm;
    const role = mapEntraGroupsToRole([GROUP_IDS.csm]);
    expect(role).toBe("csm");
  });

  it("respects priority: admin beats executive when user is in both groups", () => {
    process.env.ENTRA_GROUP_ADMIN     = GROUP_IDS.admin;
    process.env.ENTRA_GROUP_EXECUTIVE = GROUP_IDS.executive;
    const role = mapEntraGroupsToRole([GROUP_IDS.executive, GROUP_IDS.admin]);
    expect(role).toBe("admin");
  });

  it("respects priority: executive beats qa when user is in both groups", () => {
    process.env.ENTRA_GROUP_EXECUTIVE = GROUP_IDS.executive;
    process.env.ENTRA_GROUP_QA        = GROUP_IDS.qa;
    const role = mapEntraGroupsToRole([GROUP_IDS.qa, GROUP_IDS.executive]);
    expect(role).toBe("executive");
  });

  it("handles empty groups array gracefully", () => {
    process.env.ENTRA_GROUP_EXECUTIVE = GROUP_IDS.executive;
    const role = mapEntraGroupsToRole([]);
    expect(role).toBe("user");
  });
});
