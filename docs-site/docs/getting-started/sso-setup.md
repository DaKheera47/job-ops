---
id: sso-setup
title: Single Sign-On Setup
description: Configure Google, GitHub, or a generic OpenID Connect provider so JobOps users can sign in without a password.
sidebar_position: 4
---

## What it is

Single sign-on (SSO) lets people sign in to JobOps with Google, GitHub, or any OpenID Connect provider (Authentik, Keycloak, Pocket ID, Zitadel, and similar) instead of a JobOps username and password.

Providers are configured with environment variables at the server level, exactly like Gmail OAuth. There is no per-workspace identity provider configuration.

## Why it exists

Self-hosted instances usually already have an identity provider, and password-only accounts mean a second credential to rotate and revoke. SSO keeps sign-in tied to the account you already manage, while every JobOps account can still keep a password as a fallback.

## How to use it

### 1) Decide the public URL of your instance

Every provider needs a registered redirect URI, so JobOps has to know its own public URL. It resolves that URL in this order:

1. `SSO_REDIRECT_BASE_URL`
2. `JOBOPS_PUBLIC_BASE_URL`
3. The origin of the incoming request

The redirect URI is then `<base>/sso/callback/<provider>`, for example:

- `https://your-domain.com/sso/callback/google`
- `https://your-domain.com/sso/callback/github`
- `https://your-domain.com/sso/callback/oidc`
- Local development: `http://localhost:3005/sso/callback/oidc`

JobOps does not enable Express `trust proxy`, so behind a TLS-terminating reverse proxy the request-derived origin is `http://<internal-host>` and will not match what you registered. **Set `SSO_REDIRECT_BASE_URL` (or `JOBOPS_PUBLIC_BASE_URL`) whenever JobOps runs behind a proxy.** If JobOps is served under a path prefix, use `SSO_REDIRECT_BASE_URL`: `JOBOPS_PUBLIC_BASE_URL` contributes only its scheme and host.

```bash
SSO_REDIRECT_BASE_URL=https://your-domain.com
```

### 2) Google

In [Google Cloud Console](https://console.cloud.google.com/):

1. Open **APIs & Services → Credentials** and create an **OAuth client ID**.
2. Choose **Web application**.
3. Add the authorized redirect URI `https://your-domain.com/sso/callback/google`.

Then configure:

```bash
SSO_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
SSO_GOOGLE_CLIENT_SECRET=your-client-secret
```

JobOps requests the scopes `openid email profile` and discovers endpoints from `https://accounts.google.com`.

### 3) GitHub

In GitHub, open **Settings → Developer settings → OAuth Apps** and create a new OAuth App:

1. **Homepage URL**: `https://your-domain.com`
2. **Authorization callback URL**: `https://your-domain.com/sso/callback/github`

Then configure:

```bash
SSO_GITHUB_CLIENT_ID=your-client-id
SSO_GITHUB_CLIENT_SECRET=your-client-secret
```

JobOps requests the scopes `read:user user:email`. GitHub accounts are matched on the immutable numeric user id, so renaming a GitHub account does not break an existing link.

### 4) Generic OpenID Connect (including Pocket ID)

Create an OIDC client in your provider with the callback URL `https://your-domain.com/sso/callback/oidc`, then configure:

```bash
SSO_OIDC_ISSUER_URL=https://id.example.com
SSO_OIDC_CLIENT_ID=your-client-id
# Optional. Omit for a public client; JobOps then authenticates with PKCE only.
SSO_OIDC_CLIENT_SECRET=your-client-secret
# Optional. Shown on the sign-in button ("Continue with ..."). Defaults to "SSO".
SSO_OIDC_DISPLAY_NAME=Pocket ID
# Optional. Defaults to "openid profile email".
SSO_OIDC_SCOPES=openid profile email
```

Notes:

- `SSO_OIDC_ISSUER_URL` is the issuer, not the authorization endpoint. For Pocket ID it is the base URL of the Pocket ID instance; JobOps reads `/.well-known/openid-configuration` from it.
- PKCE is always used. If your provider supports public clients, leave `SSO_OIDC_CLIENT_SECRET` unset and register the client as public.
- Discovery over plain `http://` is rejected by default. For a LAN-only provider without TLS, set `SSO_OIDC_ALLOW_INSECURE_HTTP=true`. Do not use this over the public internet: authorization codes and tokens then travel unencrypted.

### 5) Restart and connect an existing account

Restart the container so the new environment is read. Enabled providers then appear on `/sign-in` under an **or continue with** divider.

By default no provider can create accounts, so the first sign-in has to be linked to an existing JobOps account:

1. Sign in with your JobOps username and password.
2. Open **Settings → Environment & Workspaces → Security → Connected accounts**.
3. Click **Connect** for the provider and complete the provider's consent screen.

The provider button then works on the sign-in page. Each user manages their own connected accounts; the same list has an **Unlink** action.

Under **Account password** in the same panel, every user can set or change their JobOps password. Users who have a password must enter the current one; users created by SSO have no password and can set one directly.

### 6) Optional: just-in-time account creation

Just-in-time (JIT) signup lets a first-time SSO user get a JobOps account without an admin creating one. It is off for every provider by default.

```bash
SSO_GOOGLE_ALLOW_SIGNUP=true
SSO_GOOGLE_ALLOWED_EMAIL_DOMAINS=example.com,example.org
```

Anyone can create a Google or GitHub identity, so for those two providers the flag only takes effect together with a non-empty domain allowlist. `SSO_GOOGLE_ALLOW_SIGNUP=true` with an empty `SSO_GOOGLE_ALLOWED_EMAIL_DOMAINS` leaves signup disabled and logs a warning. JobOps additionally requires the provider to report the email address as verified.

For the generic OIDC provider the allowlist is optional, because your provider already decides who may authenticate. Set `SSO_OIDC_ALLOWED_EMAIL_DOMAINS` if you want a second gate on top of it. A non-empty list also makes JobOps require the provider to report the email as verified, so leave the list empty if your provider does not emit an `email_verified` claim.

Each provisioned local user gets their own private workspace, the same as a user created from **Settings**. In hosted mode, provisioning also requires `JOBOPS_HOSTED_SIGNUPS_ENABLED=true` and adds the user to the configured hosted tenant.

### 7) Recommended: disable the bundled analytics beacons

The default JobOps HTML loads Umami and OpenPanel, which report the page URL they see. Both are deferred scripts, so they can run before the app bundle does: JobOps removes the authorization code from the callback URL as its first action, which keeps it out of browser history and out of later referrers, but not necessarily out of the very first pageview. On an instance handling company identities, turn the beacons off instead:

```bash
JOBOPS_DISABLE_ANALYTICS=true
```

## Common problems

### The provider buttons do not appear on the sign-in page

- A provider is enabled only when its client id is set (and, for the generic provider, `SSO_OIDC_ISSUER_URL` as well).
- Restart the container after editing `.env`; the variables are read by the server process.

### `Single sign-on is disabled in the public demo.`

Demo instances (`DEMO_MODE=true`) refuse to start a provider sign-in. The buttons are still rendered, because the list of enabled providers is a public endpoint.

### `redirect_uri_mismatch`, or the provider rejects the callback

- The registered redirect URI must be character-for-character `<base>/sso/callback/<provider>`, including scheme, port, and any path prefix.
- Behind a reverse proxy, set `SSO_REDIRECT_BASE_URL`. Without it JobOps derives `http://<internal-host>` from the request.

### `Set SSO_REDIRECT_BASE_URL (or JOBOPS_PUBLIC_BASE_URL) to the public URL of this JobOps instance`

JobOps could not derive its own URL from the request either. Set one of the two variables explicitly.

### `This sign-in link is no longer valid.`

The browser tab that finished the sign-in is not the one that started it. The pending flow is kept in that tab's session storage, so opening the callback link in another tab, another browser, or after closing the original tab cannot complete.

### `SSO session expired, try again`

The server-side half of the flow is gone. It expires 10 minutes after the provider button is clicked, is consumed on first use (so a reloaded callback URL fails), and is held in memory per process — it does not survive a restart, and a multi-instance deployment must pin a browser to one instance for the duration of a sign-in. This is the same limitation as the Gmail OAuth state store.

### `No JobOps account is linked to this <provider> identity`

Expected when JIT signup is off. Sign in with a password and connect the provider under **Settings → Environment & Workspaces → Security** first, or enable signup as described above.

### `This identity is not allowed to create an account on this instance`

JIT signup is on, but the identity failed the gate: the provider did not report a verified email address, or the email domain is not in `SSO_*_ALLOWED_EMAIL_DOMAINS`.

### `This <provider> account is already linked to a different user`

An identity belongs to exactly one JobOps account. Unlink it from the other account first, or link a different provider account.

### `Set a password before removing your last sign-in method`

The account has no password and this is its only connected account. Set a password under **Account password**, or connect a second provider, then unlink.

### `SSO provider <name> discovery failed`

JobOps could not read `/.well-known/openid-configuration` from `SSO_OIDC_ISSUER_URL`. Check that the issuer URL is the provider's base URL, that JobOps can reach it from inside its container, and that plain-`http://` issuers have `SSO_OIDC_ALLOW_INSECURE_HTTP=true`.

### A user lost access to their identity provider

A system admin resets that user's password under **Settings → Environment & Workspaces → Security**, using the **New password** field and **Reset** on the user's row. The user then signs in with the password and reconnects a provider themselves. Admins cannot unlink another user's connected account.

## Related pages

- [Self-Hosting (Docker Compose)](/docs/next/getting-started/self-hosting)
- [Gmail OAuth Setup](/docs/next/getting-started/gmail-oauth-setup)
- [Settings](/docs/next/features/settings)
- [Common Problems](/docs/next/troubleshooting/common-problems)
