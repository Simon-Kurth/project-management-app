# Microsoft Entra ID (Azure AD) SSO Activation Guide

**The Wheelhouse** — Internal Executive Dashboard  
**Audience:** IT Administrator / DevOps Engineer

---

## Overview

The Wheelhouse supports Microsoft Entra ID (Azure AD) as its primary authentication provider. When the four required environment variables are set, the application automatically presents a **"Sign in with Microsoft"** button on the login page and enforces the full SSO flow. When the variables are absent, the application falls back to password-based login for demo/development use.

The authentication chain is:

```
User clicks "Sign in with Microsoft"
        ↓
Entra ID login page (corporate credentials)
        ↓
/api/auth/entra/callback (validates id_token, provisions user)
        ↓  [if Duo is also configured]
Duo Universal Prompt (second factor)
        ↓
Dashboard (signed session cookie)
```

---

## Step 1 — Register the Application in Entra ID

1. Sign in to the [Azure Portal](https://portal.azure.com) as a Global Administrator or Application Administrator.
2. Navigate to **Azure Active Directory → App registrations → New registration**.
3. Fill in the registration form:

| Field | Value |
|---|---|
| Name | `The Wheelhouse` (or your preferred name) |
| Supported account types | **Accounts in this organizational directory only** (single-tenant) |
| Redirect URI | `https://YOUR_DOMAIN/api/auth/entra/callback` |

4. Click **Register**.
5. Copy the **Application (client) ID** — this is `ENTRA_CLIENT_ID`.
6. Copy the **Directory (tenant) ID** — this is `ENTRA_TENANT_ID`.

---

## Step 2 — Create a Client Secret

1. In the app registration, go to **Certificates & secrets → Client secrets → New client secret**.
2. Set a description (e.g., `wheelhouse-prod`) and an expiry (24 months recommended).
3. Click **Add** and immediately copy the **Value** — this is `ENTRA_CLIENT_SECRET`.

> **Important:** The secret value is only shown once. Store it securely in your secrets manager immediately.

---

## Step 3 — Configure API Permissions

The application requires the following Microsoft Graph permissions:

| Permission | Type | Purpose |
|---|---|---|
| `openid` | Delegated | OpenID Connect sign-in |
| `profile` | Delegated | Read user's display name |
| `email` | Delegated | Read user's email address |
| `User.Read` | Delegated | Read signed-in user's profile |

These are the default permissions added automatically. No additional permissions are required unless you want group membership in the token (see Step 5).

Click **Grant admin consent** for your organisation after adding permissions.

---

## Step 4 — Set Environment Variables

Add the following variables to your production `.env` file or secrets manager:

```env
# ── Microsoft Entra ID (Azure AD) SSO ──────────────────────────────────────
ENTRA_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_CLIENT_SECRET=your-client-secret-value
ENTRA_REDIRECT_URI=https://YOUR_DOMAIN/api/auth/entra/callback
```

After setting these variables, restart the application. The login page will automatically display the **"Sign in with Microsoft"** button.

---

## Step 5 — Role Mapping via Entra Groups (Optional but Recommended)

By default, all users who successfully authenticate via Entra ID are assigned the **Executive** role (full access to all 9 dashboard tabs). To enforce role-based access control through Entra group membership:

### 5a — Enable Group Claims in the App Manifest

1. In the app registration, go to **Token configuration → Add groups claim**.
2. Select **Security groups** and check **Group ID** under ID token.
3. Click **Add**.

### 5b — Create Security Groups in Entra ID

Create one security group per dashboard role:

| Group Name | Dashboard Role | Access |
|---|---|---|
| `Wheelhouse-Executive` | `executive` | All 9 tabs |
| `Wheelhouse-Company` | `company` | All 9 tabs |
| `Wheelhouse-QA` | `qa` | QA tab only |
| `Wheelhouse-SalesMarketing` | `sales_marketing` | Sales + Marketing tabs |
| `Wheelhouse-CSM` | `csm` | CSM tab only |
| `Wheelhouse-Admin` | `admin` | All tabs + User Management |

### 5c — Set Group ID Environment Variables

Copy each group's **Object ID** from Entra ID and set:

```env
ENTRA_GROUP_ADMIN=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_GROUP_EXECUTIVE=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_GROUP_COMPANY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_GROUP_QA=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_GROUP_SALES_MARKETING=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
ENTRA_GROUP_CSM=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

Once any `ENTRA_GROUP_*` variable is set, users who are not in any configured group will receive the `user` role (no dashboard access) instead of defaulting to `executive`.

> **Priority order:** admin > executive > company > qa > sales_marketing > csm  
> If a user is in multiple groups, the highest-priority role wins.

---

## Step 6 — Verify the Flow

1. Open the application in a browser.
2. The login page should now show a **"Sign in with Microsoft"** button.
3. Click it — you should be redirected to `login.microsoftonline.com`.
4. Sign in with a corporate account.
5. If Duo is also configured, you will be redirected to the Duo Universal Prompt.
6. After successful authentication, you should land on the dashboard.

---

## Combining Entra ID with Duo MFA

When both Entra ID and Duo are configured, the authentication chain is fully enforced:

1. User authenticates with their Microsoft corporate credentials (first factor).
2. The application redirects to Duo Universal Prompt (second factor).
3. Only after both factors succeed is a session cookie issued.

Refer to `docs/DUO_ACTIVATION_GUIDE.md` for Duo setup instructions.

---

## Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| "Sign in with Microsoft" button not visible | `ENTRA_CLIENT_ID` not set | Verify all four `ENTRA_*` env vars are set and server restarted |
| `AADSTS50011: Reply URL mismatch` | Redirect URI mismatch | Ensure `ENTRA_REDIRECT_URI` exactly matches the URI registered in Entra |
| `AADSTS700016: Application not found` | Wrong tenant or client ID | Double-check `ENTRA_TENANT_ID` and `ENTRA_CLIENT_ID` |
| User lands on dashboard with wrong role | Group claims not in token | Enable group claims in Token configuration (Step 5a) |
| `Invalid state: missing PKCE verifier` | State cookie lost between redirect hops | Ensure the application is not behind a load balancer that strips cookies; use sticky sessions or Redis state store for multi-replica deployments |
| Redirect loop after Entra callback | Session cookie not being set | Check `ENTRA_REDIRECT_URI` uses HTTPS; verify `sameSite` and `secure` cookie settings |

---

## Security Notes

- The application uses **PKCE (Proof Key for Code Exchange)** to protect the authorization code flow against interception attacks.
- The CSRF state token is validated on every callback — requests with unknown or expired state tokens are rejected.
- Client secrets should be rotated annually and stored in a secrets manager (Azure Key Vault, HashiCorp Vault, AWS Secrets Manager), never in source code or unencrypted files.
- For multi-replica deployments, replace the in-memory CSRF state store (`csrfStateStore` in `server/entraRoutes.ts`) with a Redis-backed store to ensure state tokens are shared across instances.

---

*Last updated: March 2026 · The Wheelhouse · DataOceans Internal*
