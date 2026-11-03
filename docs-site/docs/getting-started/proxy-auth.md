---
id: proxy-auth
title: Reverse Proxy Header Authentication
description: Sign users in with the identity a trusted reverse proxy (Authelia, Authentik forward auth, Traefik, Caddy) already authenticated.
sidebar_position: 5
---

## What it is

Proxy header authentication lets JobOps trust a username that your reverse proxy forwards in an HTTP header, usually `X-Remote-User`. If your proxy already signs users in (Authelia, Authentik forward auth, oauth2-proxy, Tailscale, and similar), they land in JobOps without a second login form.

It is off by default and only available in local (self-hosted) mode.

## Why it exists

Self-hosted setups often put every service behind one authenticating proxy. Forward auth keeps a single sign-in for all of them and avoids a separate JobOps password. For OpenID Connect providers that JobOps can talk to directly, see [Single Sign-On Setup](/docs/next/getting-started/sso-setup).

## How to use it

### 1) Make sure only the proxy can reach JobOps

JobOps trusts the header only when the TCP connection comes from an address in `PROXY_AUTH_TRUSTED_PROXIES`. Publish the JobOps port only to the proxy's network (a Docker network or `127.0.0.1`), and make the proxy overwrite any `X-Remote-User` header sent by clients.

### 2) Configure JobOps

```bash
PROXY_AUTH_ENABLED=true
# Required. Comma-separated IPs or CIDR ranges of your reverse proxy.
PROXY_AUTH_TRUSTED_PROXIES=172.18.0.0/16
# Optional. Defaults to X-Remote-User.
PROXY_AUTH_USER_HEADER=X-Remote-User
# Optional. Header with the display name used when an account is created.
PROXY_AUTH_NAME_HEADER=X-Remote-Name
# Optional. Create an account the first time an unknown user arrives. Default: false.
PROXY_AUTH_ALLOW_SIGNUP=false
```

`PROXY_AUTH_ENABLED=true` without at least one valid `PROXY_AUTH_TRUSTED_PROXIES` entry is ignored and a warning is logged, because otherwise any client could forge the header.

Docker Compose reads `.env` only when the container is created, so recreate the service after editing it:

```bash
docker compose up -d --force-recreate job-ops
```

### 3) Forward the header from your proxy

Caddy with Authelia:

```caddyfile
jobops.example.com {
  forward_auth authelia:9091 {
    uri /api/authz/forward-auth
    copy_headers Remote-User Remote-Name
  }
  reverse_proxy job-ops:3001 {
    header_up X-Remote-User {http.request.header.Remote-User}
    header_up X-Remote-Name {http.request.header.Remote-Name}
  }
}
```

Use the header names your proxy emits through `PROXY_AUTH_USER_HEADER` and `PROXY_AUTH_NAME_HEADER` instead of renaming them, if that is simpler.

### 4) Sign in

Open JobOps through the proxy. The sign-in page calls `POST /api/auth/proxy`, and JobOps exchanges the forwarded username for a normal session token. Usernames are matched case-insensitively against existing JobOps usernames.

- The first admin must still be created through the setup wizard. Proxy sign-in is refused until at least one user exists.
- An unknown user is rejected unless `PROXY_AUTH_ALLOW_SIGNUP=true`. A created user gets their own private workspace and no password.
- Disabled users are rejected.
- Password sign-in keeps working for direct access, for example `http://localhost:3005`.

## Common problems

### The sign-in form still appears

- Check that `PROXY_AUTH_ENABLED=true` and `PROXY_AUTH_TRUSTED_PROXIES` are set and the service was recreated with `docker compose up -d --force-recreate job-ops`.
- `GET /api/auth/proxy/status` returns `{ "enabled": true }` when the feature is active.
- After you log out, the sign-in page signs you in again as long as the proxy still forwards your identity. End the session at the proxy to sign out fully.

### `Request did not come from a trusted proxy`

The connection came from an address outside `PROXY_AUTH_TRUSTED_PROXIES`. Inside Docker, use the proxy container's network range, for example `docker network inspect <network>`. Do not list `0.0.0.0/0`: that lets any client forge the header.

### `Authentication required`

The user header was missing or sent more than once. Confirm the proxy sets exactly one `PROXY_AUTH_USER_HEADER` header.

### `No JobOps account exists for this user`

Create the user in **Settings → Environment & Workspaces → Security**, or set `PROXY_AUTH_ALLOW_SIGNUP=true`.

### Security note

Whoever controls the header becomes that user, including the admin if their username matches. Treat network access to JobOps as equivalent to the proxy's own login.

## Related pages

- [Single Sign-On Setup](/docs/next/getting-started/sso-setup)
- [Self-Hosting (Docker Compose)](/docs/next/getting-started/self-hosting)
- [Common Problems](/docs/next/troubleshooting/common-problems)
