---
id: passkeys
title: Passkeys
description: Sign in with a device PIN, fingerprint, or face instead of a password, and manage registered passkeys.
sidebar_position: 15
---

## What it is

A passkey is a WebAuthn credential stored by your device or password manager instead of a password stored in your head.

Each passkey is bound to one JobOps account and to the domain your instance is served from. Signing in with a passkey gives you exactly the same session as signing in with a password.

Passkeys are additive. Your username and password keep working, and you can register several passkeys per account (laptop, phone, hardware key).

## Why it exists

A password can be phished, reused, or typed into a lookalike site. A passkey cannot: the browser only offers it to the domain it was created for, and the private key never leaves the authenticator.

JobOps requires user verification for both registration and sign-in, so every ceremony asks for your PIN, fingerprint, or face. A passkey is the sole factor when you sign in with it, so proof of presence alone is not enough.

## How to use it

### Register a passkey

1. Sign in with your username and password.
2. Open **Settings → Environment & Workspaces** and scroll to **Security**.
3. Click **Add passkey**.
4. Name it, for example `Work laptop`. Leave the field blank and JobOps names it `Passkey 1`, `Passkey 2`, and so on.
5. Click **Create passkey** and confirm with your device PIN, fingerprint, or face.

The new passkey appears in the list with the date it was added and when it was last used. A **Synced** badge means the authenticator reported the credential as backed up, so your password manager makes it available on your other devices.

### Sign in with a passkey

1. Open the sign-in page.
2. Click **Sign in with a passkey** under the password form.
3. Choose the account in the browser prompt and confirm with your PIN, fingerprint, or face.

There is no username to type. JobOps only registers discoverable passkeys, so the authenticator tells the server which account it unlocked.

The button is shown only on the **Sign in** tab, and only when the browser supports WebAuthn and the page is served over HTTPS or from `localhost`. Dismissing the browser prompt cancels quietly and leaves you on the form.

### Rename or remove a passkey

- Click **Rename** next to a passkey, edit the name, and click **Save**.
- Click the bin icon and confirm to remove it. That device can no longer sign in, and you can register it again later.

Removing a passkey in JobOps does not remove the copy your operating system or password manager keeps. Delete it there too, or the browser keeps offering a credential the server no longer knows.

### Configure the relying party

JobOps does not enable Express `trust proxy`, so it cannot work out its own public URL from a request. Every container deployment must state the origin browsers use, whether or not a reverse proxy sits in front of it:

```bash
# Default Docker Compose setup, reached at http://localhost:3005
WEBAUTHN_ORIGINS=http://localhost:3005

# Behind a reverse proxy
WEBAUTHN_ORIGINS=https://jobops.example.com
```

- `WEBAUTHN_ORIGINS`: comma-separated list of exact origins (scheme, host, and port) that browsers use to reach JobOps. This is the only setting most deployments need.
- If it is unset, JobOps falls back to the origin part of `JOBOPS_PUBLIC_BASE_URL`.
- If neither is set, passkey requests fail with `Passkeys are not configured`. The one exception is `npm run dev`, where a request whose `Origin` is `localhost` or `127.0.0.1` is accepted so the Vite dev proxy works without configuration. The container image runs with `NODE_ENV=production`, so that exception never applies to it — the sign-in and **Add passkey** buttons still appear, and every ceremony fails until an origin is configured.
- `WEBAUTHN_RP_ID`: the domain passkeys are bound to. Defaults to the hostname of the first configured origin. Set it to the shared parent domain (for example `example.com`) when you serve JobOps from several subdomains and want one passkey to work across all of them.
- `WEBAUTHN_RP_NAME`: the application name shown in the browser prompt. Defaults to `JobOps`.
- `WEBAUTHN_CHALLENGE_TTL_MS`: how long a started ceremony stays valid. Defaults to `300000` (5 minutes).

A few more constraints are worth knowing before you deploy:

- Pending ceremonies live in the memory of the process that started them. If you run several JobOps instances behind a load balancer, both halves of a ceremony must reach the same instance.
- Sign-in ceremonies are counted per source address, and at most 100 may be pending from one address at a time, so an anonymous flood cannot use up the instance-wide limit. Anything over the limit gets `Too many passkey requests in progress, try again shortly` until the pending ceremonies are finished or expire. JobOps does not trust proxy headers, so a reverse proxy counts as one address for all the users behind it.
- Passkey sign-in is disabled in public demo mode.

## Common problems

### I do not see the passkey button on the sign-in page

Cause:

- the browser does not support WebAuthn
- the page is served over plain HTTP from something other than `localhost`, for example a LAN address like `http://192.168.1.10:3005`

Fix:

- put JobOps behind HTTPS; browsers expose WebAuthn only in a secure context
- set `WEBAUTHN_ORIGINS` to that HTTPS origin

### "Passkeys are not configured"

Cause:

- neither `WEBAUTHN_ORIGINS` nor `JOBOPS_PUBLIC_BASE_URL` is set, and the request did not come from localhost during development. The stock Docker Compose deployment is in this state until you configure it.

Fix:

- set `WEBAUTHN_ORIGINS` to the exact origin in your address bar — `http://localhost:3005` for the default Compose file — and restart the container

### "Passkey challenge expired"

Cause:

- more than `WEBAUTHN_CHALLENGE_TTL_MS` passed between opening the prompt and confirming it
- the server restarted during the ceremony
- several instances are running without sticky sessions, so verification reached a different process
- the same challenge was submitted twice; each one is single-use

Fix:

- click **Sign in with a passkey** or **Create passkey** again to start a fresh ceremony

### "Passkey not recognized"

Cause:

- the credential is not in this database, for example after restoring a backup taken before the passkey was registered, or after the account was disabled or deleted
- the origin or domain the browser used does not match `WEBAUTHN_ORIGINS` and `WEBAUTHN_RP_ID`

Fix:

- sign in with your password and register the passkey again
- confirm `WEBAUTHN_ORIGINS` matches the address bar exactly, including scheme and port

### "This device already has a passkey for your account"

Cause:

- the authenticator already holds a passkey for this account, and JobOps asks it not to create a duplicate

Fix:

- use the existing passkey to sign in
- or remove it in **Settings → Environment & Workspaces → Security**, delete the device-side copy, then register again

### Passkeys stopped working after the domain changed

Cause:

- passkeys are bound to the domain they were created for, so browsers do not offer them on a new one

Fix:

- sign in with your password and register new passkeys on the new domain
- set `WEBAUTHN_RP_ID` to a stable parent domain before moving JobOps between subdomains

## Related pages

- [Settings](/docs/next/features/settings)
- [Self-Hosting](/docs/next/getting-started/self-hosting)
- [Database Backups](/docs/next/getting-started/database-backups)
- [Common Problems](/docs/next/troubleshooting/common-problems)
