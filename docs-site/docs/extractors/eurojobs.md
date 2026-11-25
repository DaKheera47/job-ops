---
id: eurojobs
title: EuroJobs Extractor
description: Public API-backed EuroJobs discovery for IT roles in Europe, integrated into automatic pipeline runs.
sidebar_position: 11
---

## What it is

Original website: [EuroJobs](https://eurojobs.ai/)

This extractor searches the public EuroJobs jobs API and maps job listings into job-ops. It uses `GET https://eurojobs.ai/api/v1/jobs` for search and `GET https://eurojobs.ai/api/v1/jobs/{id}` for full descriptions. No EuroJobs account or API key is required.

API reference: [EuroJobs API docs](https://eurojobs.ai/docs/api)

## Why it exists

EuroJobs lists IT roles (software, data, DevOps, security, product, and design) in the EU, the EEA, the United Kingdom, and Switzerland, collected from employers' own applicant tracking system boards. Its API returns structured city, country, work mode, salary, skill, and seniority fields without browser automation or another credential.

## How to use it

1. Open **Jobs > Find jobs** and build or enter your search.
2. In **Configure your search**, enable **EuroJobs** under sources.
3. Set search terms, country or cities, workplace types, and the usual result limit.
4. Select **Run search**.

Defaults and constraints:

- EuroJobs is offered only when the selected country is in the EU, the EEA, the United Kingdom, or Switzerland, or when **worldwide** is selected.
- Search terms are sent to EuroJobs one at a time as the `q` parameter.
- The selected country is sent as an ISO 3166-1 alpha-2 code, for example `DE` or `GB`.
- Each selected city is searched separately as a EuroJobs city slug, for example `berlin` or `zurich`. City entries that are country names are covered by the country filter instead. The shared result limit is split across the selected cities.
- When **Remote** is the only workplace type, `remote=true` is sent to EuroJobs. Other workplace type combinations are filtered locally using the job's work mode.
- Requests are sent one at a time. Each search term and city reads at most 5 pages of up to 100 jobs, so the effective limit is 500 jobs per search term and city.
- For each new job, the full description is fetched from the detail endpoint, one request at a time. Jobs already stored in job-ops keep the short description snippet and are not fetched again. If a detail request fails, the snippet is kept.
- The job link and application link point to the job page on eurojobs.ai. The employer application is reached from that page. The API's `apply_url` field is not used, because it passes through a EuroJobs sign-in step before reaching the employer.
- Salary, employment type, seniority, role family, skills, and number of openings are mapped when EuroJobs provides them.
- EuroJobs caches API responses for about 5 minutes and does not document a rate-limit allowance or availability SLA.

### Attribution

The EuroJobs API response includes this notice: "Attribution required. Link back to https://eurojobs.ai on any page that republishes our listings." Every job imported by this extractor keeps its eurojobs.ai job page as the job link. If you republish these listings outside job-ops, keep a link back to https://eurojobs.ai.

## Common problems

### EuroJobs does not appear under Sources

- Check that the selected country is in the EU, the EEA, the United Kingdom, or Switzerland.
- Confirm the running build contains the EuroJobs extractor package and shared source catalog entry.
- Check `GET /api/eurojobs/health` for runtime discovery or upstream errors.

### A run returns fewer jobs than requested

- EuroJobs only lists IT roles in Europe, so non-IT search terms return few or no jobs.
- City filters use English city slugs. A city name that EuroJobs does not recognize returns no jobs for that city. Use the English name, for example `Munich` rather than `München`.
- Broaden the search term, country, city, or workplace filters.

### EuroJobs temporarily fails

- A EuroJobs `429` or `5xx` response on a search request fails that extractor run without exposing the upstream response body.
- Retry later or temporarily disable EuroJobs while keeping other sources enabled.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Add an Extractor](/docs/next/workflows/add-an-extractor)
