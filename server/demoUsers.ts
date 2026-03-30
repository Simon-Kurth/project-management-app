/**
 * server/demoUsers.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * In-memory demo user store used as a fallback when the SQL Server database is
 * not reachable (e.g. local development, demo environments without a DB).
 *
 * Passwords are pre-hashed with bcrypt (cost 10) so the normal bcrypt.compare
 * path is used — no special-casing in the auth logic.
 *
 * Demo credentials:
 *   executive@demo.com   / Executive@2024!      (all 9 tabs)
 *   qa@demo.com          / QA@2024!             (QA tab only)
 *   salesmarketing@demo.com / SalesMarketing@2024! (Sales + Marketing)
 *   csm@demo.com         / CSM@2024!            (CSM tab only)
 */

import type { User } from "./db";

// Synthetic user IDs for demo users (negative to avoid colliding with real DB IDs)
const DEMO_USERS: User[] = [
  {
    id:             -1,
    openId:         "demo-executive",
    email:          "executive@demo.com",
    name:           "Demo Executive",
    role:           "executive",
    passwordHash:   "$2b$10$xcGojBlwHM0lhyPExle7EOydrK2TXS4/m2DNngAGJLoqVQ8Q/qUsO",
    isActive:       true,
    loginMethod:    "password",
    entraOid:       null,
    entraUpn:       null,
    entraTenantId:  null,
    lastSignedIn:   new Date("2024-01-01T00:00:00Z"),
    mfaSecret:      null,
    mfaEnabled:     false,
    mfaVerified:    false,
    createdAt:      new Date("2024-01-01T00:00:00Z"),
    updatedAt:      new Date("2024-01-01T00:00:00Z"),
  },
  {
    id:             -2,
    openId:         "demo-qa",
    email:          "qa@demo.com",
    name:           "Demo QA",
    role:           "qa",
    passwordHash:   "$2b$10$D1vZw6awFr5iQ0p3EKh/HusIu2Q7KvIO1ClpHpTSgntSxdJZtzX0q",
    isActive:       true,
    loginMethod:    "password",
    entraOid:       null,
    entraUpn:       null,
    entraTenantId:  null,
    lastSignedIn:   new Date("2024-01-01T00:00:00Z"),
    mfaSecret:      null,
    mfaEnabled:     false,
    mfaVerified:    false,
    createdAt:      new Date("2024-01-01T00:00:00Z"),
    updatedAt:      new Date("2024-01-01T00:00:00Z"),
  },
  {
    id:             -3,
    openId:         "demo-sales",
    email:          "salesmarketing@demo.com",
    name:           "Demo Sales & Marketing",
    role:           "sales_marketing",
    passwordHash:   "$2b$10$J6vpuOdQTaPVb6MMEIkCPu37RthMiDKPmGFiTfzToHtFAr/2rlHEe",
    isActive:       true,
    loginMethod:    "password",
    entraOid:       null,
    entraUpn:       null,
    entraTenantId:  null,
    lastSignedIn:   new Date("2024-01-01T00:00:00Z"),
    mfaSecret:      null,
    mfaEnabled:     false,
    mfaVerified:    false,
    createdAt:      new Date("2024-01-01T00:00:00Z"),
    updatedAt:      new Date("2024-01-01T00:00:00Z"),
  },
  {
    id:             -4,
    openId:         "demo-csm",
    email:          "csm@demo.com",
    name:           "Demo CSM",
    role:           "csm",
    passwordHash:   "$2b$10$O7Ns0XVFgoHhgWry/vxkjuF9SBIasgVxRz2rHk5dY4pXrk3FmZbLi",
    isActive:       true,
    loginMethod:    "password",
    entraOid:       null,
    entraUpn:       null,
    entraTenantId:  null,
    lastSignedIn:   new Date("2024-01-01T00:00:00Z"),
    mfaSecret:      null,
    mfaEnabled:     false,
    mfaVerified:    false,
    createdAt:      new Date("2024-01-01T00:00:00Z"),
    updatedAt:      new Date("2024-01-01T00:00:00Z"),
  },
];

/**
 * Look up a demo user by email (case-insensitive).
 * Returns undefined if the email is not a demo account.
 */
export function getDemoUser(email: string): User | undefined {
  return DEMO_USERS.find((u) => u.email?.toLowerCase() === email.toLowerCase());
}

/**
 * Returns true if the email belongs to a demo account.
 */
export function isDemoEmail(email: string): boolean {
  return DEMO_USERS.some((u) => u.email?.toLowerCase() === email.toLowerCase());
}
