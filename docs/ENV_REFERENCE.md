# Environment Variable Reference

**The Wheelhouse** — Internal Executive Dashboard

This document lists every environment variable the application reads. Copy the relevant sections into your secrets manager or deployment configuration.

---

## Core Application

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3000` | Port the Express server listens on |
| `DATABASE_URL` | Yes | — | Microsoft SQL Server connection string (see formats below) |
| `JWT_SECRET` | Yes | — | 64-character hex string for signing session cookies. Generate with `openssl rand -hex 32` |
| `NODE_ENV` | No | `development` | Set to `production` in production deployments |

### DATABASE_URL Formats

The application accepts both ADO.NET connection string format and URL format.

**ADO.NET connection string (recommended for Azure SQL):**
```
Server=your-server.database.windows.net;Database=wheelhouse;User Id=sa;Password=your-password;Encrypt=true;TrustServerCertificate=false;
```

**URL format:**
```
mssql://username:password@your-server.database.windows.net/wheelhouse
```

**Named instance with port:**
```
Server=your-server.company.com,1433;Database=wheelhouse;User Id=sa;Password=your-password;Encrypt=true;TrustServerCertificate=true;
```

Set `TrustServerCertificate=true` only for on-premises SQL Server with self-signed certificates. Always use `Encrypt=true` in production.

---

## Microsoft Entra ID (Azure AD) SSO

All four variables must be set to enable SSO. When any is absent, the application falls back to password-based login.

See `docs/ENTRA_ACTIVATION_GUIDE.md` for step-by-step setup instructions.

| Variable | Required for SSO | Description |
|---|---|---|
| `ENTRA_TENANT_ID` | Yes | Azure AD tenant GUID (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) |
| `ENTRA_CLIENT_ID` | Yes | App registration Application (client) ID |
| `ENTRA_CLIENT_SECRET` | Yes | App registration client secret value |
| `ENTRA_REDIRECT_URI` | Yes | Must exactly match the redirect URI registered in Entra (e.g. `https://wheelhouse.company.com/api/auth/entra/callback`) |

### Entra Group → RBAC Role Mapping (optional)

When any `ENTRA_GROUP_*` variable is set, users not in a configured group receive the `user` role (no dashboard access). When none are set, all Entra users default to `executive`.

Priority order: **admin > executive > company > qa > sales_marketing > csm**

| Variable | Dashboard Role | Access |
|---|---|---|
| `ENTRA_GROUP_ADMIN` | `admin` | All tabs + User Management |
| `ENTRA_GROUP_EXECUTIVE` | `executive` | All 9 tabs |
| `ENTRA_GROUP_COMPANY` | `company` | All 9 tabs |
| `ENTRA_GROUP_QA` | `qa` | QA tab only |
| `ENTRA_GROUP_SALES_MARKETING` | `sales_marketing` | Sales + Marketing tabs |
| `ENTRA_GROUP_CSM` | `csm` | CSM tab only |

---

## Duo Security MFA

All three variables must be set to enforce Duo Universal Prompt. When absent, MFA is bypassed (dev/demo mode).

See `docs/DUO_ACTIVATION_GUIDE.md` for step-by-step setup instructions.

| Variable | Required for Duo | Description |
|---|---|---|
| `DUO_CLIENT_ID` | Yes | Client ID from Duo Web SDK application |
| `DUO_CLIENT_SECRET` | Yes | Client Secret from Duo Web SDK application |
| `DUO_API_HOST` | Yes | Duo API hostname (e.g. `api-xxxxxxxx.duosecurity.com`) |
| `DUO_REDIRECT_URL` | Yes | Callback URL after Duo authentication (e.g. `https://wheelhouse.company.com/duo-callback`) |

---

## Jira Connector (optional)

When configured, the application fetches live Delivery and Development KPIs from Jira. When absent, mock data is used.

| Variable | Description |
|---|---|
| `JIRA_BASE_URL` | Jira Cloud base URL (e.g. `https://your-org.atlassian.net`) |
| `JIRA_EMAIL` | Service account email for Jira API authentication |
| `JIRA_API_TOKEN` | Jira API token (generate at id.atlassian.com) |
| `JIRA_PROJECT_KEY` | Jira project key (e.g. `ENG`) |
| `JIRA_BOARD_ID` | Jira board ID (numeric) |
| `JIRA_SYNC_ENABLED` | Set to `true` to enable background sync (default: `false`) |
| `JIRA_SYNC_INTERVAL_MINUTES` | How often to sync Jira data (default: `60`) |

---

## Recommended Production Configuration

For a production deployment with full Entra SSO + Duo MFA:

```
# Core
# SQL Server ADO.NET connection string:
DATABASE_URL=Server=your-server.database.windows.net;Database=wheelhouse;User Id=sa;Password=your-password;Encrypt=true;TrustServerCertificate=false;
JWT_SECRET=<64-char hex>
NODE_ENV=production

# Entra SSO
ENTRA_TENANT_ID=<tenant-guid>
ENTRA_CLIENT_ID=<client-guid>
ENTRA_CLIENT_SECRET=<secret>
ENTRA_REDIRECT_URI=https://wheelhouse.company.com/api/auth/entra/callback

# Entra Groups (recommended)
ENTRA_GROUP_ADMIN=<group-guid>
ENTRA_GROUP_EXECUTIVE=<group-guid>
ENTRA_GROUP_QA=<group-guid>
ENTRA_GROUP_SALES_MARKETING=<group-guid>
ENTRA_GROUP_CSM=<group-guid>

# Duo MFA
DUO_CLIENT_ID=<duo-client-id>
DUO_CLIENT_SECRET=<duo-secret>
DUO_API_HOST=api-xxxxxxxx.duosecurity.com
DUO_REDIRECT_URL=https://wheelhouse.company.com/duo-callback
```

---

*Last updated: March 2026 · The Wheelhouse · DataOceans Internal*
