---
id: codex-auth
title: Codex Authentication
description: Authenticate Codex in JobOps using either device-code sign-in or host login reuse in Docker.
sidebar_position: 3
---

## What it is

This page explains how to authenticate the `codex` provider in JobOps.

You can use either:

1. Device-code sign-in from the JobOps UI
2. Host-login reuse by mounting your host `.codex` folder into Docker

## Why it exists

Some accounts/workspaces disable device-code authorization and show this error:

`Enable device code authorization for Codex in ChatGPT Security Settings, then run "codex login --device-auth" again`

When that happens, JobOps can still work with Codex by reusing host login instead of device code.

## How to use it

### Option 1) Device-code sign-in in JobOps

1. In JobOps, set **Provider** to `Codex` in onboarding or settings.
2. Click **Start Sign-In**.
3. Open the verification URL shown in the UI.
4. Enter the one-time code shown in the UI.
5. Return and click **Refresh Status** (or wait for auto-refresh).

### Option 2) Login once on host, reuse inside Docker

1. In `.env`, set:

```bash
CODEX_HOME_MOUNT=/absolute/path/to/your/.codex
```

2. Restart JobOps:

```bash
docker compose up -d
```

3. Log in once on the host:

```bash
codex login
```

4. In JobOps, keep provider as `Codex` and click **Refresh Status**.

## Common problems

### Device-code auth error in UI

Symptom:

- `Enable device code authorization for Codex in ChatGPT Security Settings...`

Fix:

1. Enable device-code authorization in **ChatGPT Security Settings**
2. Retry **Start Sign-In**

Or use Option 2 (host-login reuse) above.

### Host login completed but JobOps still says unauthenticated

Checklist:

1. Confirm `CODEX_HOME_MOUNT` points to the host directory that contains your Codex auth files.
2. Restart container after changing `.env`.
3. Run `codex login` on host again.
4. Click **Refresh Status** in JobOps.

## Related pages

- [Self-Hosting (Docker Compose)](/docs/next/getting-started/self-hosting)
- [Common Problems](/docs/next/troubleshooting/common-problems)
