---
id: codex-auth
title: Codex Authentication
description: Authenticate Codex in JobOps with the built-in device-code sign-in flow.
sidebar_position: 3
---

## What it is

This page explains how to authenticate the `codex` provider in JobOps.

Use the device-code sign-in flow from the JobOps UI.

## Why it exists

Some accounts/workspaces disable device-code authorization and show this error:

`Enable device code authorization for Codex in ChatGPT Security Settings, then run "codex login --device-auth" again`

When that happens, complete the ChatGPT security setting first, then retry sign-in.

## How to use it

### Device-code sign-in in JobOps

1. In JobOps, set **Provider** to `Codex` in onboarding or settings.
2. Click **Start Sign-In**.
3. Open the verification URL shown in the UI.
4. Enter the one-time code shown in the UI.
5. Return and click **Check Status** (or wait for auto-refresh).

## Common problems

### Device-code auth error in UI

Symptom:

- `Enable device code authorization for Codex in ChatGPT Security Settings...`

Fix:

1. Enable device-code authorization in **ChatGPT Security Settings**
2. Retry **Start Sign-In**

## Related pages

- [Self-Hosting (Docker Compose)](/docs/next/getting-started/self-hosting)
- [Common Problems](/docs/next/troubleshooting/common-problems)
