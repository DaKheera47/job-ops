---
id: automatic-browser-checks
title: Automatic browser checks
description: Configure optional CapSolver solving for Cloudflare checks without manual Solve prompts.
sidebar_position: 7
---

## What it is

JobOps can use CapSolver to resolve full-page Cloudflare checks for Gradcracker
and Hiring Cafe. A non-empty `CAPSOLVER_API_KEY` enables automatic mode for the
whole server, including hosted workspaces. The default is the existing manual
browser flow.

## Why it exists

Hosted customers and self-hosted users can keep a search running without opening
a challenge viewer. Automatic mode never shows **Solve**, even if the key is
invalid, the balance is empty, or a check cannot be solved.

## How to use it

1. Add the following to the server's `.env`:

   ```dotenv
   CAPSOLVER_API_KEY=your-capsolver-key
   CAPSOLVER_PROXY=http://username:password@proxy.example.com:8080
   ```

2. Use a static or sticky HTTP(S) proxy. Keep its egress IP stable across the
   solve and the subsequent search. CapSolver recommends a sticky session of
   at least three minutes. A key alone cannot solve full-page Cloudflare checks.
3. Recreate the container to load the environment:

   ```bash
   docker compose up -d --force-recreate
   ```

4. Run a search normally. Protected Hiring Cafe and Gradcracker requests use the
   configured proxy. Successful solves persist clearance cookies and the solver
   user agent in the private workspace's cookie directory for the HTTP retry.
   Gradcracker uses its HTTP path rather than launching a manual browser, even
   if `GRADCRACKER_FORCE_BROWSER=1` is set.

Remove the key or leave it blank to restore manual solving. Whitespace-only
keys count as unset. These credentials are configured only through the server
environment; they are not exposed in browser settings or progress events.

CapSolver is a paid external service billed to the configured account. Each
solve is bounded to two minutes, with at most three solve attempts per job board
in a pipeline run. Cancellation stops polling and aborts an in-flight API
request, although an already-created external task may still incur a charge.

JobOps sends CapSolver the API key, the configured proxy credentials, the
challenged job-board URL (which can contain search terms and locations), and
fresh challenge-page HTML. It does not send resumes or ranking profiles. The
proxy receives job-board traffic. Cookies and user agents are private to each
workspace; the configured billing account and proxy are server-wide.

The integration follows CapSolver's
[Cloudflare Challenge API](https://docs.capsolver.com/en/guide/captcha/cloudflare_challenge/).

## Common problems

- **No proxy configured:** full-page Cloudflare solving needs both environment
  variables. JobOps records a source error instead of asking the user to solve.
- **Invalid key or insufficient balance:** check the server configuration and
  CapSolver account. No manual prompt is shown while a key is configured.
- **A check keeps returning:** confirm a stable proxy IP and that the proxy is
  usable by both JobOps and CapSolver. After three attempts, that board stops
  retrying for this run. Collected jobs and other sources are retained.
- **Vercel Security Checkpoint:** CapSolver's Cloudflare API does not solve
  Vercel checks. These are reported as source errors without a Solve fallback.
- **Another job board is challenged:** automatic solving currently supports
  the two boards above. Unsupported checks are recorded as source errors.

If an automatic check fails and no jobs were found, the run fails with the
source error. Otherwise it continues with the jobs it has already collected.

## Related pages

- [Find jobs](/docs/next/features/pipeline-run)
- [Self-hosting](/docs/next/getting-started/self-hosting)
- [Gradcracker](/docs/next/extractors/gradcracker)
- [Hiring Cafe](/docs/next/extractors/hiring-cafe)
