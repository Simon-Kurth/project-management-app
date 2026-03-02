# Duo MFA Activation Guide

This guide explains how to activate Duo Security MFA on your self-hosted
Executive Dashboard instance. **No code changes are required.** Duo activates
automatically the moment the four environment variables below are present.

---

## How the Env-Gate Works

The server evaluates `isDuoConfigured()` on every login attempt:

```
DUO_CLIENT_ID + DUO_CLIENT_SECRET + DUO_API_HOST  →  all set?
  YES → Duo Universal Prompt is enforced (password + Duo push/passcode)
  NO  → Dev/bypass mode (password only, no MFA)
```

This means:
- **Development / staging** — leave the Duo vars unset. The app works normally with password login only.
- **Production** — set all four vars. Duo is enforced on every login with zero downtime.

---

## Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DUO_CLIENT_ID` | Client ID from your Duo Web SDK application | `DIXXXXXXXXXXXXXXXXXX` |
| `DUO_CLIENT_SECRET` | Client Secret from your Duo Web SDK application | `abc123...` |
| `DUO_API_HOST` | Duo API hostname from the application page | `api-XXXXXXXX.duosecurity.com` |
| `DUO_REDIRECT_URL` | Full callback URL (must match Duo app config exactly) | `https://dashboard.yourcompany.com/duo-callback` |

---

## Step-by-Step Setup

### 1. Create a Duo Web SDK Application

1. Log in to the [Duo Admin Panel](https://admin.duosecurity.com)
2. Navigate to **Applications → Protect an Application**
3. Search for **"Web SDK"** and click **Protect**
4. On the application page, copy:
   - **Client ID** → `DUO_CLIENT_ID`
   - **Client Secret** → `DUO_CLIENT_SECRET`
   - **API Hostname** → `DUO_API_HOST`
5. Under **Redirect URIs**, add: `https://YOUR_DOMAIN/duo-callback`
   - This must exactly match `DUO_REDIRECT_URL`
6. Save the application

### 2. Enroll Users in Duo

Before activating MFA, ensure all dashboard users are enrolled in Duo:

1. In the Duo Admin Panel, go to **Users → Add User**
2. Add each user by their **email address** (must match the email in the dashboard DB)
3. Send them an enrollment link via **Duo Admin Panel → Users → [user] → Send Enrollment Email**
4. Users install the Duo Mobile app and complete enrollment

> **Important:** The Duo username must match the user's email address in the dashboard database. The connector uses `user.email` as the Duo username when initiating auth.

### 3. Set Environment Variables on Your Server

**Docker Compose (recommended):**

Add to your `docker-compose.yml` under the `backend` service environment, or use a `.env` file:

```env
DUO_CLIENT_ID=DIXXXXXXXXXXXXXXXXXX
DUO_CLIENT_SECRET=your_client_secret_here
DUO_API_HOST=api-XXXXXXXX.duosecurity.com
DUO_REDIRECT_URL=https://dashboard.yourcompany.com/duo-callback
```

**Systemd / direct Node.js:**

```bash
export DUO_CLIENT_ID=DIXXXXXXXXXXXXXXXXXX
export DUO_CLIENT_SECRET=your_client_secret_here
export DUO_API_HOST=api-XXXXXXXX.duosecurity.com
export DUO_REDIRECT_URL=https://dashboard.yourcompany.com/duo-callback
```

### 4. Verify Duo is Active

After setting the variables and restarting the server, check the Duo status
endpoint:

```bash
curl https://dashboard.yourcompany.com/api/trpc/auth.duoStatus
```

Expected response when Duo is configured and reachable:
```json
{"result":{"data":{"ok":true,"message":"Duo servers reachable"}}}
```

The **login page** will also show a **"Duo MFA: Active"** green badge in the
footer when Duo is configured.

### 5. Test the Full Flow

1. Open the login page
2. Enter valid credentials and click **Sign in with Duo MFA**
3. The browser redirects to the Duo Universal Prompt
4. Approve the push notification (or enter a passcode)
5. Duo redirects back to `/duo-callback`
6. The app validates the callback, sets the session cookie, and redirects to `/dashboard`

---

## Security Notes

| Property | Value |
|----------|-------|
| State token TTL | 10 minutes (expires if user takes too long in Duo) |
| State token reuse | One-time use only (replay attacks prevented) |
| Session duration | 8 hours (configurable via `maxAge` in `routers.ts`) |
| Audit log entries | `LOGIN_DUO_INITIATED`, `LOGIN_SUCCESS_DUO`, `DUO_CALLBACK_FAILED` |
| Expired state cleanup | Automatic — scheduler runs every 30 minutes |

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Login succeeds without Duo prompt | `DUO_CLIENT_ID` / `DUO_CLIENT_SECRET` / `DUO_API_HOST` not all set | Verify all three vars are present and non-empty |
| "Invalid or expired Duo state token" | User took >10 min in Duo prompt, or state was already used | Ask user to log in again |
| "Duo health check failed" | Wrong `DUO_API_HOST` or network firewall blocking outbound HTTPS to Duo | Check firewall allows outbound 443 to `*.duosecurity.com` |
| Duo redirects to wrong URL | `DUO_REDIRECT_URL` doesn't match the Redirect URI in Duo Admin Panel | Update both to match exactly |
| User not found in Duo | User's email not enrolled in Duo | Enroll user in Duo Admin Panel before they log in |

---

## All Environment Variables Reference

```env
# ── Required for all deployments ──────────────────────────────────────────────
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/exec_dashboard
JWT_SECRET=<64-char hex — generate: openssl rand -hex 64>
APP_URL=https://dashboard.yourcompany.com

# ── Duo MFA (optional in dev, required in production) ─────────────────────────
DUO_CLIENT_ID=
DUO_CLIENT_SECRET=
DUO_API_HOST=
DUO_REDIRECT_URL=https://dashboard.yourcompany.com/duo-callback

# ── Jira Integration (optional) ───────────────────────────────────────────────
JIRA_BASE_URL=https://yourcompany.atlassian.net
JIRA_API_TOKEN=<base64 of service@co.com:api_token>
JIRA_BOARD_ID=
JIRA_PROJECT_KEY=
JIRA_SYNC_INTERVAL_MINUTES=30
```
