/**
 * server/entra.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Microsoft Entra ID (Azure AD) OIDC integration using @azure/msal-node.
 *
 * Flow:
 *   1. getEntraAuthCodeUrl()  → redirect user to Entra login page
 *   2. handleEntraCallback()  → exchange auth code for tokens, validate id_token,
 *                               return EntraUser (oid, upn, name, email, groups)
 *
 * All configuration is read from environment variables at call time (not at
 * module load time) so that tests can set process.env before calling functions.
 *
 * When ENTRA_CLIENT_ID is absent, isEntraConfigured() returns false — the
 * application falls back to password-based login for local/dev use.
 *
 * Environment variables required (set on production server):
 *   ENTRA_TENANT_ID      — Your Azure AD tenant GUID or "common"
 *   ENTRA_CLIENT_ID      — App registration Application (client) ID
 *   ENTRA_CLIENT_SECRET  — App registration client secret
 *   ENTRA_REDIRECT_URI   — Must match the redirect URI registered in Entra
 *                          e.g. https://wheelhouse.company.com/api/auth/entra/callback
 *
 * Optional group-to-role mapping:
 *   ENTRA_GROUP_ADMIN           — Entra group GUID → admin role
 *   ENTRA_GROUP_EXECUTIVE       — Entra group GUID → executive role
 *   ENTRA_GROUP_COMPANY         — Entra group GUID → company role
 *   ENTRA_GROUP_QA              — Entra group GUID → qa role
 *   ENTRA_GROUP_SALES_MARKETING — Entra group GUID → sales_marketing role
 *   ENTRA_GROUP_CSM             — Entra group GUID → csm role
 */

import { ConfidentialClientApplication, CryptoProvider } from "@azure/msal-node";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EntraUser {
  oid: string;          // Entra object ID — immutable, use as primary key
  upn: string;          // user@company.com
  name: string;
  email: string;
  tenantId: string;
  groups: string[];     // Entra group IDs (used for RBAC role mapping)
}

// ─── Config helpers (read dynamically at call time) ───────────────────────────

function getEntraConfig() {
  return {
    tenantId:     process.env.ENTRA_TENANT_ID     ?? "",
    clientId:     process.env.ENTRA_CLIENT_ID     ?? "",
    clientSecret: process.env.ENTRA_CLIENT_SECRET ?? "",
    redirectUri:  process.env.ENTRA_REDIRECT_URI  ?? "",
  };
}

function getGroupMap(): Record<string, string> {
  return {
    admin:           process.env.ENTRA_GROUP_ADMIN           ?? "",
    executive:       process.env.ENTRA_GROUP_EXECUTIVE       ?? "",
    company:         process.env.ENTRA_GROUP_COMPANY         ?? "",
    qa:              process.env.ENTRA_GROUP_QA              ?? "",
    sales_marketing: process.env.ENTRA_GROUP_SALES_MARKETING ?? "",
    csm:             process.env.ENTRA_GROUP_CSM             ?? "",
  };
}

// OIDC scopes — openid + profile + email are always needed.
// "GroupMember.Read.All" is only needed if you want group membership in the
// token; otherwise groups come back in the id_token if configured in Entra.
const SCOPES = ["openid", "profile", "email", "User.Read"];

// ─── MSAL Client (lazy-initialised, recreated if config changes) ──────────────

let _msalClient: ConfidentialClientApplication | null = null;
let _msalClientId = "";

function getMsalClient(): ConfidentialClientApplication {
  const { tenantId, clientId, clientSecret } = getEntraConfig();

  // Recreate client if clientId has changed (e.g. env var set after startup)
  if (!_msalClient || _msalClientId !== clientId) {
    _msalClient = new ConfidentialClientApplication({
      auth: {
        clientId,
        clientSecret,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
      system: {
        loggerOptions: {
          loggerCallback: (level, message, containsPii) => {
            if (!containsPii && process.env.NODE_ENV !== "production") {
              console.debug(`[MSAL][${level}] ${message}`);
            }
          },
          piiLoggingEnabled: false,
        },
      },
    });
    _msalClientId = clientId;
  }
  return _msalClient;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Returns true when all required Entra env vars are present. */
export function isEntraConfigured(): boolean {
  const { tenantId, clientId, clientSecret, redirectUri } = getEntraConfig();
  return !!(tenantId && clientId && clientSecret && redirectUri);
}

/**
 * Generate the Entra authorization URL to redirect the user to.
 * @param state  A random CSRF token you generate and store server-side.
 */
export async function getEntraAuthCodeUrl(state: string): Promise<string> {
  const { redirectUri } = getEntraConfig();
  const client = getMsalClient();
  const cryptoProvider = new CryptoProvider();
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();

  // Store verifier in the state store alongside the state token so we can
  // retrieve it in handleEntraCallback. We encode it in the state string
  // separated by a pipe — the Entra callback handler will split it out.
  const compositeState = `${state}|${verifier}`;

  const url = await client.getAuthCodeUrl({
    scopes:              SCOPES,
    redirectUri,
    state:               compositeState,
    codeChallenge:       challenge,
    codeChallengeMethod: "S256",
    prompt:              "select_account", // force account picker for multi-account tenants
  });

  return url;
}

/**
 * Exchange the authorization code returned by Entra for tokens.
 * Validates the id_token and returns the normalised EntraUser.
 *
 * @param code   The `code` query param from the Entra callback
 * @param state  The full composite state string from the callback
 */
export async function handleEntraCallback(
  code: string,
  state: string,
): Promise<EntraUser> {
  const { redirectUri, tenantId } = getEntraConfig();

  // Split the composite state to recover the PKCE verifier
  const [, verifier] = state.split("|");
  if (!verifier) {
    throw new Error("Invalid state: missing PKCE verifier");
  }

  const client = getMsalClient();

  const result = await client.acquireTokenByCode({
    code,
    scopes:       SCOPES,
    redirectUri,
    codeVerifier: verifier,
  });

  if (!result?.account) {
    throw new Error("Entra token exchange failed: no account in result");
  }

  const claims = result.idTokenClaims as Record<string, unknown>;

  // Extract user fields from id_token claims
  const oid      = (claims["oid"]               as string) ?? "";
  const upn      = (claims["preferred_username"] as string) ?? (claims["upn"] as string) ?? "";
  const name     = (claims["name"]               as string) ?? result.account.name ?? "";
  const email    = upn || ((claims["email"] as string) ?? "");
  const tid      = (claims["tid"]                as string) ?? tenantId;

  // Groups may be in the token if "groupMembershipClaims" is set to "All" in
  // the Entra app manifest. Otherwise they come as an empty array here and
  // you'd need a separate Graph API call (not needed for most deployments).
  const groups: string[] = Array.isArray(claims["groups"])
    ? (claims["groups"] as string[])
    : [];

  if (!oid) {
    throw new Error("Entra id_token missing required 'oid' claim");
  }

  return { oid, upn, name, email, tenantId: tid, groups };
}

/**
 * Map Entra group memberships to a Wheelhouse RBAC role.
 * Falls back to "user" (no dashboard access) if no group matches.
 *
 * Priority order: admin > executive > company > qa > sales_marketing > csm
 *
 * If no ENTRA_GROUP_* vars are configured at all, defaults to "executive"
 * so the dashboard is immediately usable without group setup.
 */
export function mapEntraGroupsToRole(groups: string[]): string {
  const groupMap = getGroupMap();
  const priority = ["admin", "executive", "company", "qa", "sales_marketing", "csm"];

  for (const role of priority) {
    const groupId = groupMap[role];
    if (groupId && groups.includes(groupId)) {
      return role;
    }
  }

  // If no ENTRA_GROUP_* vars are set, default all Entra users to "executive"
  // so the dashboard is usable out of the box. Change this to "user" if you
  // want to require explicit group assignment before granting access.
  const anyGroupConfigured = Object.values(groupMap).some(Boolean);
  return anyGroupConfigured ? "user" : "executive";
}
