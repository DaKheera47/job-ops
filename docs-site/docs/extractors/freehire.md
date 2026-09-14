---
id: freehire
title: FreeHire Extractor
description: Public API-backed FreeHire job discovery integrated into automatic pipeline runs.
sidebar_position: 10
---

## What it is

Original website: [FreeHire](https://freehire.me/)

This extractor searches FreeHire's public agent API and maps full job descriptions and enriched metadata into job-ops. It uses `GET /api/v1/agent/jobs/search`; no FreeHire account or API key is required.

## Why it exists

FreeHire aggregates jobs from many boards and exposes structured country, city, workplace, salary, skill, and seniority fields. Its public API adds broad coverage without browser automation or another credential.

## How to use it

1. Open **Run jobs** and choose **Automatic**.
2. Enable **FreeHire** under **Sources**.
3. Set search terms, country or cities, workplace types, and the usual result limit.
4. Start the run.

Defaults and constraints:

- Search terms are sent to FreeHire one at a time.
- Selected country, cities, and workplace types are passed to FreeHire as filters.
- The shared result setting is capped at FreeHire's maximum of 100 jobs per search term.
- Descriptions are requested as Markdown.
- Job URLs point to the original upstream posting, so the existing job-ops URL de-duplication also removes overlap with other extractors.
- FreeHire does not document a rate-limit allowance or availability SLA.

## Common problems

### FreeHire does not appear under Sources

- Confirm the running build contains the FreeHire extractor package and shared source catalog entry.
- Check `GET /api/freehire/health` for runtime discovery or upstream errors.

### A run returns fewer jobs than requested

- FreeHire may have fewer matching open jobs for the selected filters.
- Each search term is limited to one API page of at most 100 jobs.
- Broaden the search term, country, city, or workplace filters.

### FreeHire temporarily fails

- A FreeHire `429` or `503` response fails that extractor run without exposing the upstream response body.
- Retry later or temporarily disable FreeHire while keeping other sources enabled.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Add an Extractor](/docs/next/workflows/add-an-extractor)
