---
id: manual
title: Manual Import Extractor
description: Import jobs from pasted descriptions or shared URLs and run AI-assisted inference.
sidebar_position: 4
---

import BookmarkletGenerator from "@site/src/components/BookmarkletGenerator";

## What it is

Manual import lets you add jobs that automated scrapers miss.

It supports two workflows:

- Review-first import in the UI for pasted descriptions or fetched URLs
- Direct URL ingestion with `POST /api/manual-jobs/ingest` for bookmarklets and iOS Shortcuts

## Why it exists

Some job pages are worth saving immediately while you are browsing on desktop or mobile.

The URL ingestion endpoint exists so you can send the current page URL to JobOps and let the server do the rest:

- fetch the page
- extract the job content
- infer job fields with the configured LLM
- create the manual job
- try to move it to `ready` automatically

This bypasses the in-app review sheet when speed matters more than manual cleanup.

## How to use it

### Review-first flow

1. Paste a job description or a URL into the app
2. Review the inferred fields
3. Import the job
4. The server stores the job and tries to move it to the `Ready` stage

### Direct URL ingestion endpoint

Endpoint:

- `POST /api/manual-jobs/ingest`

Request body:

```json
{
  "url": "https://example.com/jobs/backend-engineer"
}
```

Auth behavior:

- If you have enabled Authentication, send the same `Authorization: Bearer ...` token used after signing in to JobOps
- If auth is not enabled, no auth header is required

Success response:

- Returns `{ ok: true, data, meta.requestId }`
- `data.job` is the created manual job
- `data.ingestion.movedToReady` tells you whether the server reached the `ready` stage
- `data.ingestion.warning` is present when the job was created but could not be moved to `ready`

Example `fetch` call:

```js
await fetch("/api/manual-jobs/ingest", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer YOUR_TOKEN",
  },
  body: JSON.stringify({
    url: "https://example.com/jobs/backend-engineer",
  }),
});
```

### Interactive bookmarklet generator

Use this generator to produce a bookmarklet you can drag to your browser bookmarks bar:

<BookmarkletGenerator />

Generator notes:

- Enter your JobOps host as an origin such as `https://jobops.example.com`
- For local development, use the backend API origin such as `http://localhost:3001`, not the Vite client origin on `http://localhost:5173`
- If auth is enabled, use a JobOps Bearer token rather than a raw username/password pair
- The docs page keeps the host and token in the browser while generating the bookmarklet
- Once you save the bookmark, the bookmark itself contains the generated script and any embedded token
- When clicked, the bookmarklet sends the current page URL to your own JobOps server

Short way to get your Bearer token:

1. Sign in to JobOps.
2. Open browser DevTools.
3. Go to `Application` or `Storage` -> `Session Storage`.
4. Select your JobOps origin and copy `jobops.authToken`.

Fallback:

- If you cannot find it in storage, inspect a protected `/api/*` request in the Network tab and copy the token from the `Authorization: Bearer ...` header.

Static example bookmarklet:

```js
javascript:(async()=>{await fetch("http://YOUR_HOST/api/manual-jobs/ingest",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer YOUR_TOKEN"},body:JSON.stringify({url:window.location.href})});})();
```

Notes:

- Replace `https://YOUR_HOST` with your JobOps server origin
- If auth is enabled, use a Bearer token from JobOps sign-in
- If auth is disabled, remove the `Authorization` header entirely
- The endpoint is optimized for URL-only capture; it does not require a pre-built draft

### iOS Shortcut example

If you prefer iPhone or iPad share-sheet capture, you can import this shared Shortcut:

- [JobOps URL Ingest Shortcut](https://www.icloud.com/shortcuts/2b16d702b13b4a98bba2a946df531517)

Shortcut notes:

- Open the link on iOS or iPadOS and add it to Shortcuts
- Review the host and token fields inside the Shortcut before using it
- If auth is enabled, use the same JobOps Bearer token described above

### Inference and storage behavior

Inference endpoints and services:

- `POST /api/manual-jobs/infer`
- `POST /api/manual-jobs/import`
- `POST /api/manual-jobs/ingest`
- `orchestrator/src/server/services/manualJob.ts`

Behavior:

- Converts fetched HTML or pasted text into plain-text context
- Uses the configured LLM to infer structured fields
- Falls back to page metadata during URL ingestion when title or employer is missing
- Stores the job with source `manual`
- Starts async suitability scoring

If the job can be created but `move_to_ready` fails, URL ingestion still keeps the manual job as a recoverable record and returns a warning instead of dropping it.

## Common problems

- **Auth required**
  If your instance protects API routes, bookmarklets and Shortcuts must send the same Bearer token used for the app after sign-in.

- **Fetch blocked by the target site**
  Some job boards require client-side rendering or block automated fetches. In that case `POST /api/manual-jobs/ingest` may return `502 UPSTREAM_ERROR`.

- **Inference could not build a complete job**
  If the fetched content is too thin, the endpoint can return `422 UNPROCESSABLE_ENTITY`.

- **Job created but not moved to ready**
  If tailoring or PDF generation fails after creation, the endpoint still returns success with `movedToReady: false` and a warning so you can recover the job later in the app.

- **No LLM key configured**
  Review-first manual import can still be used with manual edits. Direct URL ingestion is less reliable without inference support.

## Related pages

- [Pipeline Run](/docs/features/pipeline-run)
- [Extractors Overview](/docs/extractors/overview)
