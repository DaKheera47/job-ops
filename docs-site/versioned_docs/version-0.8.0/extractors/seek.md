---
id: seek
title: Seek
description: Australia/NZ job search via the Apify seek-com-au-scraper actor.
sidebar_position: 9
---

Seek is Australia's largest job board. This extractor uses the [Apify](https://apify.com) platform to run the `unfenced-group/seek-com-au-scraper` actor, which searches Seek and returns structured job data.

## Why Apify?

Seek's frontend is heavily anti-bot protected. The Apify actor handles browser rendering and rate-limiting transparently — no local Playwright install or proxy management needed.

## Setup

1. Create a free Apify account at [https://apify.com](https://apify.com).
2. Go to **Account → Integrations** and copy your **API token**.
3. Add it to your `.env`:

```
APIFY_TOKEN=apify_api_xxxxxxxxxxxx
```

That's it. Once `APIFY_TOKEN` is set, the Seek source will appear in the pipeline source list.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `APIFY_TOKEN` | Yes | — | Apify API token for running actors |
| `SEEK_MAX_JOBS_PER_TERM` | No | `50` | Max results fetched per search term |
| `SEEK_APIFY_ACTOR_ID` | No | `unfenced-group/seek-com-au-scraper` | Override the Apify actor (deploy-time swap) |

## Cost

The `unfenced-group/seek-com-au-scraper` actor costs approximately **$1.50 per 1,000 results**. Apify's free tier provides **$5/month credit**, which covers roughly **3,000 results per month** at no cost.

## Common problems

**Seek source not showing in pipeline UI**
Ensure `APIFY_TOKEN` is set in your environment and the app has been restarted. The source is gated on the token being present.

**Actor run fails with "actor not found"**
Check that `SEEK_APIFY_ACTOR_ID` points to a published public actor. The default `unfenced-group/seek-com-au-scraper` must be accessible from your Apify account.

**Zero results returned**
Try increasing `SEEK_MAX_JOBS_PER_TERM` or verify that your search terms are relevant to the Australian job market.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Add an Extractor](/docs/next/workflows/add-an-extractor)
- [Adzuna](/docs/next/extractors/adzuna) — another API-based extractor that requires credentials
