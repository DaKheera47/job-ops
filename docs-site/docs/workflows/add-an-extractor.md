---
id: add-an-extractor
title: Add an Extractor
description: How to add a new extractor using the manifest contract and shared extractor catalog.
sidebar_position: 2
---

## What it is

This guide explains how to add a new extractor that is auto-registered at orchestrator startup.

The extractor runtime is discovered from a local `manifest.ts` file, and the source is type-safe across API/client through the shared catalog in `shared/src/extractors/index.ts`.

Extractor manifests must live in extractor packages under `extractors/<name>/` only. Do not add manifest files inside `orchestrator/`.
Extractor run logic should also live in the extractor package so orchestrator stays extractor-agnostic.

## Why it exists

Without a manifest contract, adding extractors required touching multiple orchestrator files.

With the manifest system, contributors only need to:

1. Add a manifest in their extractor package.
2. Add the new source id to the shared typed catalog.

That keeps runtime wiring dynamic while preserving compile-time safety in API and client code.

## How to use it

1. Create your extractor package under `extractors/<name>/`.
2. Add a `manifest.ts` in the extractor package root (or `src/manifest.ts`).
   - Valid locations are only `extractors/<name>/manifest.ts` or `extractors/<name>/src/manifest.ts`.
   - `orchestrator/**/manifest.ts` is not used for extractor discovery.
3. Export a manifest with:
   - `id`
   - `displayName`
   - `providesSources`
   - `requiredEnvVars` (optional)
   - `run(context)` that returns `{ success, jobs, error? }`
4. Add the new source id to `shared/src/extractors/index.ts`:
   - append to `EXTRACTOR_SOURCE_IDS`
   - add an entry in `EXTRACTOR_SOURCE_METADATA`
5. Ensure your extractor maps output to `CreateJobInput[]`.
6. Run the full CI checks.

Example manifest:

```ts
import type { ExtractorManifest } from "@shared/types/extractors";

export const manifest: ExtractorManifest = {
  id: "myextractor",
  displayName: "My Extractor",
  providesSources: ["myextractor"],
  requiredEnvVars: ["MYEXTRACTOR_API_KEY"],
  async run(context) {
    // context.searchTerms, context.settings, context.onProgress, context.shouldCancel
    const jobs = [];
    return { success: true, jobs };
  },
};

export default manifest;
```

Subprocess extractors are supported. Keep subprocess spawning inside `run(context)` so orchestrator only depends on the manifest contract.

## Common problems

### Extractor not discovered at startup

- Check file path: `extractors/<name>/manifest.ts` or `extractors/<name>/src/manifest.ts`.
- Ensure the file exports `default` or named `manifest`.

### Source compiles in extractor but fails in API/client

- Add the new source id to `shared/src/extractors/index.ts`.
- Confirm metadata exists for that source id.

### Source appears in shared catalog but is unavailable at runtime

- The manifest was not loaded successfully.
- Check startup logs for registry warnings.

### Source requires credentials but never returns jobs

- Add and validate `requiredEnvVars`.
- Verify your manifest `run(context)` reads settings/env values correctly.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Adzuna Extractor](/docs/next/extractors/adzuna)
- [Hiring Cafe Extractor](/docs/next/extractors/hiring-cafe)
- [UKVisaJobs Extractor](/docs/next/extractors/ukvisajobs)
