---
id: ojcp
title: OJCP and MCP
description: Search live FreeHire jobs from MCP clients using OJCP-compatible tools.
sidebar_position: 13
---

## What it is

JobOps exposes live [FreeHire](https://freehire.me/) search as an [Open Job Context Protocol](https://spec.ojcp.dev/0.1/) provider over MCP Streamable HTTP. Searches do not read or write the JobOps jobs database.

The provider currently offers two read-only tools:

- `search_jobs` searches FreeHire in real time.
- `get_job_detail` returns details cached from a recent search.

Provider discovery is available at `/.well-known/ojcp.json`. The MCP endpoint is `/ojcp/mcp`.

## Why it exists

The integration lets MCP-compatible agents discover current jobs without waiting for a JobOps pipeline run.

The MCP endpoint is unauthenticated. Search queries and location filters are sent to FreeHire, so place the endpoint behind your normal public rate limits.

## How to use it

1. Deploy JobOps behind HTTPS.
2. Set the public base URL:

   ```bash
   JOBOPS_PUBLIC_BASE_URL=https://your-jobops-host
   ```

3. Configure your MCP client with:

   - Transport: Streamable HTTP
   - URL: `https://your-jobops-host/ojcp/mcp`

4. Ask the client to list tools, then call `search_jobs`:

   ```json
   {
     "query": "senior backend engineer remote",
     "location": {
       "city": "London",
       "country": "United Kingdom",
       "remote_ok": true
     },
     "pagination": {
       "limit": 10,
       "offset": 0
     }
   }
   ```

5. Pass an `ojcp_id` returned by search to `get_job_detail`:

   ```json
   {
     "job_id": "jobops:freehire:example-slug",
     "include_employer_context": true
   }
   ```

Defaults and constraints:

- Search defaults to 10 results and supports at most 50 per call.
- FreeHire applies keyword, country, city, remote/work-mode, limit, and offset inputs.
- State, radius, employment type, salary, experience level, and posting-age filters return `unsupported_filter` rather than inaccurate pagination.
- Results include an exact employer-name match against the configured country sponsor register when that data is available. A register match does not guarantee that the vacancy offers sponsorship.
- Full job details remain available for 10 minutes in the current server process. Restarting the server or using another replica may require a new search.
- Identical searches may reuse a result for up to 15 seconds.
- Apply paths are external redirects and do not support agent submission.
- Candidate context requires `consent_scope` and is not currently used for personalization.
- The endpoint does not currently require authentication.

## Common problems

### The MCP client says Cannot POST /ojcp/mcp

The running JobOps server predates the MCP route, or the client is pointed at the frontend development server instead of the backend.

Restart the JobOps server and use `http://localhost:3001/ojcp/mcp` for the default local backend.

### The manifest contains an HTTP or localhost endpoint

`JOBOPS_PUBLIC_BASE_URL` is missing or incorrect.

Set it to the externally reachable HTTPS origin and restart JobOps.

### Search returns a provider error

FreeHire may be unavailable or may have exceeded its response deadline. Retry the search; the JobOps pipeline and database do not act as a fallback.

### A job ID from an earlier search is no longer available

The 10-minute detail cache expired, the server restarted, or the request reached another replica. Call `search_jobs` again.

## Related pages

- [Find Jobs and Apply Workflow](/docs/next/workflows/find-jobs-and-apply-workflow)
- [Settings](/docs/next/features/settings)
- [Extractor Overview](/docs/next/extractors/overview)
