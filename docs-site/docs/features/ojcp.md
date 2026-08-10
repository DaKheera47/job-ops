---
id: ojcp
title: OJCP and MCP
description: Search your JobOps workspace from MCP clients using OJCP-compatible tools.
sidebar_position: 13
---

## What it is

JobOps exposes its stored jobs as an [Open Job Context Protocol](https://spec.ojcp.dev/0.1/) provider over MCP Streamable HTTP.

The provider currently offers two read-only tools:

- `search_jobs` searches open jobs in the local workspace.
- `get_job_detail` returns the full stored details for one job.

Provider discovery is available at `/.well-known/ojcp.json`. The MCP endpoint is `/ojcp/mcp`.

## Why it exists

The integration lets MCP-compatible agents search and inspect jobs without scraping the JobOps UI or learning its private REST API.

Job data remains workspace-scoped. The MCP endpoint is currently unauthenticated and should only be exposed on localhost or a trusted private network.

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
     "filters": {
       "employment_type": "full_time",
       "salary_min": 70000
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
     "job_id": "jobops:example-id",
     "include_employer_context": true
   }
   ```

Defaults and constraints:

- Search defaults to 10 results and supports at most 50 per call.
- Expired jobs are not returned.
- Search reads jobs already stored in JobOps; it does not start an extractor or pipeline run.
- Apply paths are external redirects and do not support agent submission.
- Candidate context requires `consent_scope` and is not currently used for personalization.
- Radius searches are approximate because JobOps stores job locations as text.
- The endpoint does not currently require authentication.

## Common problems

### The MCP client says Cannot POST /ojcp/mcp

The running JobOps server predates the MCP route, or the client is pointed at the frontend development server instead of the backend.

Restart the JobOps server and use `http://localhost:3001/ojcp/mcp` for the default local backend.

### The manifest contains an HTTP or localhost endpoint

`JOBOPS_PUBLIC_BASE_URL` is missing or incorrect.

Set it to the externally reachable HTTPS origin and restart JobOps.

### Search does not discover new jobs

`search_jobs` searches the existing JobOps database. Run the normal JobOps pipeline first to discover and import new jobs.

### A job ID from an earlier search is no longer available

The job may have expired or been removed. Search results are temporary; call `search_jobs` again.

## Related pages

- [Find Jobs and Apply Workflow](/docs/next/workflows/find-jobs-and-apply-workflow)
- [Settings](/docs/next/features/settings)
- [Extractor Overview](/docs/next/extractors/overview)
