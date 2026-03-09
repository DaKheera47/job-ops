---
id: visa-sponsors
title: Visa Sponsors
description: Search licensed sponsor registers across multiple countries and use sponsor matches in your job workflow.
sidebar_position: 4
---

## What it is

The Visa Sponsors page lets you search official licensed sponsor registers from inside JobOps.

Each provider corresponds to a country's official register and is auto-discovered at startup from the `visa-sponsor-providers/` directory.

For each company, it shows:

- Match score against your query
- Company location (when available)
- Licensed routes and type/rating details
- Per-provider last refresh time and sponsor count

## Why it exists

Many roles require sponsorship-ready employers. This page helps you quickly validate whether a target company appears on an official sponsor list, so you can prioritize applications and sourcing terms.

## How to use it

1. Open **Visa Sponsors** in the app.
2. Enter a company name in the search box.
3. Optionally filter by country using the country field.
4. Select a result to view sponsor details.
5. Use the score and route details to decide whether to prioritize that employer.

### Refresh schedule

Each provider refreshes independently on its own daily schedule (default: **02:00 UTC**). Use the download/update button in the page header to fetch the latest register immediately for all providers.

### API examples

```bash
# Search sponsors across all providers
curl -X POST http://localhost:3001/api/visa-sponsors/search \
  -H "content-type: application/json" \
  -d '{"query":"Monzo","limit":100,"minScore":20}'
```

```bash
# Search sponsors restricted to a specific country
curl -X POST http://localhost:3001/api/visa-sponsors/search \
  -H "content-type: application/json" \
  -d '{"query":"Monzo","country":"united kingdom","limit":100}'
```

```bash
# Get one organization's entries (all licensed routes)
curl "http://localhost:3001/api/visa-sponsors/organization/Monzo%20Bank%20Ltd"
```

```bash
# Get status of all registered providers
curl "http://localhost:3001/api/visa-sponsors/status"
```

```bash
# Trigger manual refresh for all providers
curl -X POST http://localhost:3001/api/visa-sponsors/update
```

```bash
# Trigger manual refresh for a specific provider
curl -X POST http://localhost:3001/api/visa-sponsors/update/uk
```

## Common problems

### No results found

- Try alternate legal names (`Ltd`, `Limited`, abbreviations).
- Reduce spelling strictness by searching a shorter core name.

### Sponsor data is empty

- Run a manual refresh with the header update button (or `POST /api/visa-sponsors/update`).
- Check `GET /api/visa-sponsors/status` to see per-provider error details.
- Verify the server can reach the upstream source for that provider (e.g. `gov.uk` for the UK provider).

### Company appears once but has multiple routes

- Open the detail panel for that company; route/type entries are shown there.

### A country's provider is missing

- Check startup logs for registry warnings about that provider id, including skipped invalid manifests.
- Ensure the provider id is registered in `shared/src/visa-sponsor-providers/index.ts`.
- Ensure the manifest exists at `visa-sponsor-providers/<id>/manifest.ts` or `visa-sponsor-providers/<id>/src/manifest.ts`.
- See [Add a Visa Sponsor Provider](/docs/next/workflows/add-a-visa-sponsor-provider) for the full workflow.

## Related pages

- [Add a Visa Sponsor Provider](/docs/next/workflows/add-a-visa-sponsor-provider)
- [Orchestrator](/docs/next/features/orchestrator)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
- [Self-Hosting](/docs/next/getting-started/self-hosting)
