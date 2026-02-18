---
id: visa-sponsors
title: Visa Sponsors
description: Search the UK licensed sponsor register and use sponsor matches in your job workflow.
sidebar_position: 4
---

## What it is

The Visa Sponsors page lets you search the UK Home Office licensed sponsor register from inside JobOps.

For each company, it shows:

- Match score against your query
- Company location (when available)
- Licensed routes and type/rating details
- Last data refresh time and sponsor count

## Why it exists

Many roles require sponsorship-ready employers. This page helps you quickly validate whether a target company appears on the official sponsor list, so you can prioritize applications and sourcing terms.

## How to use it

1. Open **Visa Sponsors** in the app.
2. Enter a company name in the search box.
3. Select a result to view sponsor details.
4. Use the score and route details to decide whether to prioritize that employer.

### Refresh schedule

- Automatic update runs daily at about **02:00** (server local time).
- Use the download/update button in the page header to fetch the latest register immediately.

### API examples

```bash
# Search sponsors
curl -X POST http://localhost:3001/api/visa-sponsors/search \
  -H "content-type: application/json" \
  -d '{"query":"Monzo","limit":100,"minScore":20}'
```

```bash
# Get one organization's entries (all licensed routes)
curl "http://localhost:3001/api/visa-sponsors/organization/Monzo%20Bank%20Ltd"
```

```bash
# Trigger manual refresh
curl -X POST http://localhost:3001/api/visa-sponsors/update
```

## Common problems

### No results found

- Try alternate legal names (`Ltd`, `Limited`, abbreviations).
- Reduce spelling strictness by searching a shorter core name.

### Sponsor data is empty

- Run a manual refresh with the header update button (or `POST /api/visa-sponsors/update`).
- Check that the server can reach `gov.uk` and `assets.publishing.service.gov.uk`.

### Company appears once but has multiple routes

- Open the detail panel for that company; route/type entries are shown there.

## Related pages

- [Orchestrator](/docs/next/features/orchestrator)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
- [Self-Hosting](/docs/next/getting-started/self-hosting)
