---
id: gmail-oauth-setup
title: Gmail OAuth Setup
description: Step-by-step Google Cloud setup for JobOps Gmail tracking, with exact scopes and callback configuration.
sidebar_position: 2
---

## What it is

This guide configures Google OAuth so JobOps can read recruitment emails from Gmail for the Tracking Inbox.

## Why it exists

Gmail OAuth setup is easy to misconfigure (wrong redirect URI, missing refresh token, or unnecessary scopes). This page documents the exact defaults JobOps expects.

## How to use it

### 1) Create Google Cloud credentials

In [Google Cloud Console](https://console.cloud.google.com/):

1. Create (or select) a project.
2. Open **APIs & Services → Library** and enable **Gmail API**.
3. Open **APIs & Services → OAuth consent screen** and configure your app.
4. Open **APIs & Services → Credentials** and create **OAuth client ID**.
5. Choose **Web application**.
6. Add at least one authorized redirect URI:
  - Local: `http://localhost:3005/oauth/gmail/callback`
  - Production: `https://your-domain.com/oauth/gmail/callback`

Notes:

- If you set `GMAIL_OAUTH_REDIRECT_URI`, it must exactly match a redirect URI in Google Cloud.
- JobOps does not require JavaScript origins for this flow.

### 2) Set environment variables

Configure:

```bash
GMAIL_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GMAIL_OAUTH_CLIENT_SECRET=your-client-secret
# Optional (recommended in production)
GMAIL_OAUTH_REDIRECT_URI=https://your-domain.com/oauth/gmail/callback
```

Then restart the container/app.

### 3) Connect Gmail in JobOps

1. Open **Tracking Inbox**.
2. Click **Connect Gmail**.
3. Complete Google consent.

JobOps starts OAuth with:

- Scope: `https://www.googleapis.com/auth/gmail.readonly`
- `access_type=offline` (requests refresh token)
- `prompt=consent` (forces consent screen so refresh token is returned reliably)

### 4) Scope reference (required vs not required)

Required by JobOps:

- `https://www.googleapis.com/auth/gmail.readonly`

Not required for JobOps Gmail ingestion:

- `https://www.googleapis.com/auth/gmail.modify`
- `openid`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/userinfo.profile`

## Common problems

### Redirect URI mismatch

- Symptom: Google returns `redirect_uri_mismatch`.
- Fix: ensure the exact callback URL in `GMAIL_OAUTH_REDIRECT_URI` is also present in the OAuth client redirect URIs.

### No refresh token returned

- Symptom: connect fails after OAuth exchange.
- Fix: remove app access in your Google account, then reconnect so consent is re-granted.

### Gmail connects but no inbox results

- Check that your account actually has recruitment/application emails.
- Trigger a sync and increase `searchDays` if needed.

## Related pages

- [Self-Hosting (Docker Compose)](/docs/next/getting-started/self-hosting)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
- [Post-Application Workflow](/docs/next/workflows/post-application-workflow)
- [Common Problems](/docs/next/troubleshooting/common-problems)
