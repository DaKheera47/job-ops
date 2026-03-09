---
id: add-a-visa-sponsor-provider
title: Add a Visa Sponsor Provider
description: How to add a new country's visa sponsor register using the provider manifest contract.
sidebar_position: 3
---

## What it is

This guide explains how to add a new country's visa sponsor register that is auto-discovered by the orchestrator at startup.

Each provider is a directory under `visa-sponsor-providers/` containing a `manifest.ts` file. The manifest owns only what is country-specific: fetching and parsing the upstream register. Storage, scheduling, caching, and search are handled by the shared service layer.

Provider ids must be registered in `shared/src/visa-sponsor-providers/index.ts` to be accepted at runtime.

## Why it exists

Without a manifest contract, adding a new country's register required touching multiple orchestrator files.

With the provider system, contributors only need to:

1. Add a manifest in `visa-sponsor-providers/<id>/`.
2. Register the new id in the shared catalog.

The service layer handles everything else.

## How to use it

1. Create a directory under `visa-sponsor-providers/<id>/` where `<id>` is a short lowercase slug (e.g. `au`, `ca`).
2. Add a `manifest.ts` in that directory (or `src/manifest.ts`).
3. Export a manifest that satisfies `VisaSponsorProviderManifest`:
   - `id` — matches the directory name and the catalog entry
   - `displayName` — human-readable country name
   - `countryKey` — lowercase country string compatible with `normalizeCountryKey()` (e.g. `"australia"`)
   - `scheduledUpdateHour` (optional) — UTC hour for the daily refresh; defaults to `2`
   - `fetchSponsors()` — fetches the upstream source and returns `VisaSponsor[]`; throws on failure
4. Add the new id to `shared/src/visa-sponsor-providers/index.ts`:
   - append to `VISA_SPONSOR_PROVIDER_IDS`
   - add an entry in `VISA_SPONSOR_PROVIDER_METADATA`
5. Start the server and confirm the startup log reports the provider in the registry.
6. Run the full CI checks.

Example manifest:

```ts
import type {
  VisaSponsor,
  VisaSponsorProviderManifest,
} from "../../shared/src/types/visa-sponsors";

export const manifest: VisaSponsorProviderManifest = {
  id: "au",
  displayName: "Australia",
  countryKey: "australia",
  scheduledUpdateHour: 3,

  async fetchSponsors(): Promise<VisaSponsor[]> {
    // Fetch and parse the upstream register here.
    // Return an array of VisaSponsor objects.
    // Throw on failure — the service layer handles error state.
    return [];
  },
};

export default manifest;
```

Example catalog update in `shared/src/visa-sponsor-providers/index.ts`:

```ts
export const VISA_SPONSOR_PROVIDER_IDS = ["uk", "au"] as const;

export const VISA_SPONSOR_PROVIDER_METADATA = {
  uk: { label: "United Kingdom", countryKey: "united kingdom" },
  au: { label: "Australia", countryKey: "australia" },
};
```

## Common problems

### Provider not registered at startup

- Check the file path: valid locations are `visa-sponsor-providers/<id>/manifest.ts` or `visa-sponsor-providers/<id>/src/manifest.ts`.
- Ensure the file exports `default` or a named `manifest`.
- Check startup logs for registry warnings such as skipped invalid manifests, duplicate ids, duplicate country keys, or ids missing from the shared catalog.

### Provider id rejected at runtime

- The id must be in `VISA_SPONSOR_PROVIDER_IDS` in `shared/src/visa-sponsor-providers/index.ts`.
- Duplicate ids or duplicate `countryKey` values are skipped with a warning.

### Provider loads but returns no sponsors

- Verify `fetchSponsors()` returns a non-empty array and does not silently swallow errors.
- Check `GET /api/visa-sponsors/status` for the provider's error field.
- Trigger a manual refresh with `POST /api/visa-sponsors/update/<id>` and watch server logs.

### countryKey does not match job locations

- The `countryKey` must produce the same output as `normalizeCountryKey()` when called on job location strings.
- Use lowercase, no diacritics, matching the canonical country name used in job data.

## Related pages

- [Visa Sponsors Feature](/docs/next/features/visa-sponsors)
- [Add an Extractor Workflow](/docs/next/workflows/add-an-extractor)
- [Extractors Overview](/docs/next/extractors/overview)
