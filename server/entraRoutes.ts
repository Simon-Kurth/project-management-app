/**
 * server/entraRoutes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Express routes for the Microsoft Entra ID (Azure AD) OIDC authentication flow.
 *
 * Routes registered:
 *   GET  /api/auth/entra/login     → Redirect user to Entra authorization URL
 *   GET  /api/auth/entra/callback  → Handle Entra callback, provision user,
 *                                    then either redirect to Duo or create session
 *
 * When Entra is not configured (ENTRA_CLIENT_ID absent), these routes respond
 * with 501 Not Implemented so the frontend can gracefully fall back to the
 * password login form.
 *
 * When Duo is also configured, the callback stores a short-lived pending-auth
 * token and redirects the user to Duo Universal Prompt. The Duo callback
 * (handled by the existing tRPC duoCallback procedure) then consumes the
 * pending-auth token and creates the final session cookie.
 */

import crypto from "crypto";
import type { Express, Request, Response } from "express";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import {
  getEntraAuthCodeUrl,
  handleEntraCallback,
  isEntraConfigured,
  mapEntraGroupsToRole,
} from "./entra";
import {
  createPendingAuth,
  upsertEntraUser,
  writeAuditLog,
} from "./db";
import { initiateDuoAuth, isDuoConfigured } from "./duo";

// ─── CSRF state store (in-memory, short-lived) ────────────────────────────────
// Maps state token → { createdAt } for CSRF validation.
// A production deployment with multiple replicas should use Redis or DB instead.
const csrfStateStore = new Map<string, { createdAt: number }>();

// Prune stale state tokens every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  Array.from(csrfStateStore.entries()).forEach(([key, val]) => {
    if (val.createdAt < cutoff) csrfStateStore.delete(key);
  });
}, 10 * 60 * 1000);

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerEntraRoutes(app: Express) {
  // ── GET /api/auth/entra/login ──────────────────────────────────────────────
  // Redirects the browser to the Microsoft login page.
  // Accepts an optional `returnTo` query param (URL-encoded path) that will be
  // stored in the state and used for the final redirect after authentication.
  app.get("/api/auth/entra/login", async (req: Request, res: Response) => {
    if (!isEntraConfigured()) {
      res.status(501).json({ error: "Entra ID SSO is not configured on this server." });
      return;
    }

    try {
      // Generate a random CSRF state token
      const csrfToken = crypto.randomBytes(32).toString("hex");
      csrfStateStore.set(csrfToken, { createdAt: Date.now() });

      // getEntraAuthCodeUrl encodes the PKCE verifier into the state string
      const authUrl = await getEntraAuthCodeUrl(csrfToken);

      res.redirect(302, authUrl);
    } catch (err) {
      console.error("[Entra] Failed to build auth URL:", err);
      res.status(500).json({ error: "Failed to initiate Entra login" });
    }
  });

  // ── GET /api/auth/entra/callback ───────────────────────────────────────────
  // Microsoft redirects here after the user authenticates.
  // Validates state, exchanges code for tokens, provisions user, then either:
  //   a) Redirects to Duo Universal Prompt (if Duo is configured)
  //   b) Creates session cookie directly (if Duo is not configured)
  app.get("/api/auth/entra/callback", async (req: Request, res: Response) => {
    const code  = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const error = getQueryParam(req, "error");
    const errorDescription = getQueryParam(req, "error_description");

    const ip = req.headers["x-forwarded-for"]?.toString() || req.socket?.remoteAddress || "unknown";
    const ua = req.headers["user-agent"] || "unknown";

    // ── Handle Entra-side errors (user cancelled, MFA required by policy, etc.)
    if (error) {
      console.warn(`[Entra] Callback error: ${error} — ${errorDescription}`);
      const msg = encodeURIComponent(errorDescription || error || "Entra login failed");
      res.redirect(302, `/login?error=${msg}`);
      return;
    }

    if (!code || !state) {
      res.redirect(302, "/login?error=Missing+code+or+state");
      return;
    }

    // ── CSRF validation ────────────────────────────────────────────────────
    // The state from Entra is "csrfToken|pkceVerifier" (see entra.ts).
    // We only need to validate the csrfToken portion here.
    const csrfToken = state.split("|")[0];
    if (!csrfToken || !csrfStateStore.has(csrfToken)) {
      console.warn("[Entra] CSRF validation failed — unknown state token");
      res.redirect(302, "/login?error=Invalid+state+token");
      return;
    }
    csrfStateStore.delete(csrfToken); // consume the state token

    try {
      // ── Exchange code for tokens and extract user identity ──────────────
      const entraUser = await handleEntraCallback(code, state);

      // ── Map Entra groups to Project Management App RBAC role ────────────────────────
      const role = mapEntraGroupsToRole(entraUser.groups);

      // ── Provision / update user in DB ───────────────────────────────────
      const dbUser = await upsertEntraUser({
        entraOid:      entraUser.oid,
        entraUpn:      entraUser.upn,
        entraTenantId: entraUser.tenantId,
        name:          entraUser.name,
        email:         entraUser.email,
        role,
      });

      if (!dbUser.isActive) {
        await writeAuditLog({
          userId:    dbUser.id,
          userEmail: dbUser.email ?? undefined,
          action:    "LOGIN_BLOCKED",
          resource:  "auth",
          ipAddress: ip,
          userAgent: ua,
          metadata:  { reason: "account_inactive", method: "entra" },
        });
        res.redirect(302, "/login?error=Account+is+inactive.+Contact+your+administrator.");
        return;
      }

      // ── Branch: Duo configured → chain Duo Universal Prompt ─────────────
      if (isDuoConfigured()) {
        await writeAuditLog({
          userId:    dbUser.id,
          userEmail: dbUser.email ?? undefined,
          action:    "LOGIN_ENTRA_SUCCESS_DUO_PENDING",
          resource:  "auth",
          ipAddress: ip,
          userAgent: ua,
          metadata:  { method: "entra" },
        });

        // Store pending auth so the Duo callback can retrieve the user
        const pendingToken = crypto.randomBytes(32).toString("hex");
        await createPendingAuth({
          token:     pendingToken,
          userId:    dbUser.id,
          username:  entraUser.upn || entraUser.email,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min TTL
        });

        // Initiate Duo — stores state in duo_state_store, returns Duo auth URL
        const duoAuthUrl = await initiateDuoAuth(dbUser.id, entraUser.upn || entraUser.email);

        // Append the pending token so the Duo callback can look up the user
        // The Duo state already contains the userId, but we also pass the
        // pending token as a query param on the Duo redirect URL for safety.
        const separator = duoAuthUrl.includes("?") ? "&" : "?";
        const duoRedirect = `${duoAuthUrl}${separator}pending=${encodeURIComponent(pendingToken)}`;

        res.redirect(302, duoRedirect);
        return;
      }

      // ── Branch: Duo NOT configured → create session directly ─────────────
      await writeAuditLog({
        userId:    dbUser.id,
        userEmail: dbUser.email ?? undefined,
        action:    "LOGIN_SUCCESS",
        resource:  "auth",
        ipAddress: ip,
        userAgent: ua,
        metadata:  { method: "entra" },
      });

      const sessionToken = await sdk.createSessionToken(dbUser.openId, {
        name: dbUser.name ?? dbUser.email ?? "",
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      });

      res.redirect(302, "/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Entra callback failed";
      console.error("[Entra] Callback processing error:", err);
      await writeAuditLog({
        action:    "LOGIN_FAILED",
        resource:  "auth",
        ipAddress: ip,
        userAgent: ua,
        metadata:  { reason: "entra_callback_error", error: msg },
      });
      const encoded = encodeURIComponent("Authentication failed. Please try again.");
      res.redirect(302, `/login?error=${encoded}`);
    }
  });
}
