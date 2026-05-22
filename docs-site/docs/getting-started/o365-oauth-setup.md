---
id: o365-oauth-setup
title: O365 OAuth Setup (Entra ID / Azure)
description: Step-by-step Microsoft Entra ID setup for JobOps O365 tracking, with exact callback and scope requirements.
sidebar_position: 3
---

## What it is

This guide configures Microsoft OAuth (Microsoft Entra ID / Azure AD) so JobOps can read recruitment emails from an Outlook/Office 365 mailbox in Tracking Inbox.

## Why it exists

O365 OAuth is easy to misconfigure when app type, redirect URI, tenant selection, or API permissions are off by one setting. This page documents the exact defaults JobOps expects.

## How to use it

### 1) Register an app in Microsoft Entra admin center

In [Microsoft Entra admin center](https://entra.microsoft.com/):

1. Open **Applications → App registrations → New registration**.
2. Set an app name (for example, `JobOps Tracking Inbox`).
3. Choose supported account type:
   - **Single tenant**: your organization only.
   - **Multitenant**: if you need cross-tenant sign-in.
4. Add a redirect URI with platform **Web**:
   - Local: `http://localhost:3005/oauth/o365/callback`
   - Production: `https://your-domain.com/oauth/o365/callback`
5. Create the app registration.

### 2) Create client secret

1. Open **Certificates & secrets**.
2. Create a **New client secret**.
3. Copy the secret value immediately.

You will use:

- **Application (client) ID** as `O365_OAUTH_CLIENT_ID`
- **Client secret value** as `O365_OAUTH_CLIENT_SECRET`

### 3) Configure Microsoft Graph delegated permissions

Open **API permissions** and add delegated permissions for Microsoft Graph:

- `Mail.Read` (required)
- `User.Read` (required)
- `offline_access` (required to receive refresh tokens)

If your tenant requires admin consent, grant consent before connecting from JobOps.

### 4) Set environment variables

```bash
O365_OAUTH_CLIENT_ID=your-entra-app-client-id
O365_OAUTH_CLIENT_SECRET=your-entra-client-secret
# Optional (recommended in production)
O365_OAUTH_REDIRECT_URI=https://your-domain.com/oauth/o365/callback
# Optional: defaults to "common"
O365_OAUTH_TENANT_ID=common
```

Tenant value examples:

- `common` (default): supports Microsoft account + Entra ID sign-in where allowed.
- `<directory-tenant-id>`: enforce a single Entra tenant.

Then restart the container/app.

### 5) Connect O365 in JobOps

1. Open **Tracking Inbox**.
2. Select provider **o365**.
3. Click **Connect o365**.
4. Complete Microsoft consent.

JobOps starts OAuth with:

- Scope: `offline_access Mail.Read User.Read`
- Token endpoint based on `O365_OAUTH_TENANT_ID` (or `common` when omitted)

## Common problems

### Redirect URI mismatch

- Symptom: Microsoft returns a redirect URI error (for example `AADSTS50011`).
- Fix: ensure `O365_OAUTH_REDIRECT_URI` exactly matches a configured Web redirect URI in Entra.

### Invalid client secret

- Symptom: token exchange fails (for example `AADSTS7000215`).
- Fix: verify you used the **secret value** (not secret ID) and the secret is not expired.

### Wrong tenant or account type

- Symptom: sign-in denied for expected users or tenant-related OAuth errors.
- Fix:
  - Confirm `O365_OAUTH_TENANT_ID` matches your registration strategy (`common` vs a specific tenant ID).
  - Confirm app registration supported account type is compatible with your users.

### Connect succeeds but no results in inbox

- Check that the mailbox contains recruitment/application emails.
- Trigger sync and increase `searchDays` if needed.

## Related pages

- [Self-Hosting (Docker Compose)](/docs/next/getting-started/self-hosting)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
- [Gmail OAuth Setup](/docs/next/getting-started/gmail-oauth-setup)
- [Post-Application Workflow](/docs/next/workflows/post-application-workflow)
- [Common Problems](/docs/next/troubleshooting/common-problems)
