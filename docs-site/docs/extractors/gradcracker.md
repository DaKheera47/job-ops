---
id: gradcracker
title: Gradcracker Extractor
description: How the Gradcracker crawler builds search URLs and extracts jobs.
sidebar_position: 2
---

A plain-English walkthrough of the Gradcracker extractor in `extractors/gradcracker`.

Original website: [gradcracker.com](https://www.gradcracker.com)

## What it is

The Gradcracker extractor finds UK graduate roles from [gradcracker.com](https://www.gradcracker.com).

It now uses a fast HTTP-first scraper for normal runs. The scraper fetches Gradcracker list and detail HTML with a browser-like HTTP fingerprint, parses job cards locally, and decodes Gradcracker apply links without opening a browser. The older Playwright/Crawlee flow remains as a fallback when the HTTP path is blocked.

## Why it exists

Gradcracker is useful for UK graduate and early-career STEM roles that broad aggregators often miss.

The HTTP-first implementation keeps the same normalized job output while avoiding the startup cost of launching a browser for every successful run.

## How to use it

1. Open **Run jobs** and choose **Automatic**.
2. Select **United Kingdom** as the country.
3. Leave **Gradcracker** enabled in **Sources** or toggle it on.
4. Set your usual search terms and run budget.
5. Start the run and monitor progress in the pipeline progress card.

Defaults and controls:

- Search terms are converted to Gradcracker role slugs, such as `software systems` to `software-systems`.
- Defaults include `web-development` and `software-systems`.
- `GRADCRACKER_MAX_JOBS_PER_TERM` controls the per-term cap.
- `GRADCRACKER_HTTP_DETAIL_CONCURRENCY` controls concurrent detail-page fetches. The default is `2`.
- `GRADCRACKER_HTTP_REQUEST_DELAY_MS` controls the minimum delay between HTTP request starts. The default is `1000`.
- `JOBOPS_SKIP_APPLY_FOR_EXISTING=1` and `JOBOPS_EXISTING_JOB_URLS_FILE` are still honored by the browser fallback.
- `GRADCRACKER_FORCE_BROWSER=1` forces the legacy Playwright/Crawlee path.
- `GRADCRACKER_DISABLE_BROWSER_FALLBACK=1` returns the HTTP scraper result directly if the fast path is blocked.

Implementation flow:

1. Build search URLs from UK regions and role terms.
2. Fetch list pages and parse `article[wire:key]` job cards.
3. Fetch detail pages for new jobs only.
4. Extract `.body-content` description text.
5. Decode Gradcracker `/out/...` apply URLs from the `u` query parameter.
6. Reuse saved Cloudflare clearance cookies from the headed solve flow on the HTTP retry.
7. Fall back to Playwright/Crawlee only when the HTTP path cannot proceed.

## Common problems

### Gradcracker does not return jobs

- Confirm the selected country is **United Kingdom**.
- Try Gradcracker-specific terms such as `software systems`, `web development`, or `data science`.
- Lower the run budget if a term is too broad and you only need the newest listings.

### The HTTP scraper is blocked

- Leave browser fallback enabled so the extractor can use the existing Playwright/Crawlee challenge handling.
- When the app opens a challenge browser, complete the challenge and wait for the solver to save a `cf_clearance` cookie. The next HTTP retry uses that saved cookie and the same browser user agent.
- Set `GRADCRACKER_FORCE_BROWSER=1` when you specifically need to debug the legacy browser flow.

### Apply links stay on Gradcracker

- Some listings may not expose a decodable `/out/...` target.
- The extractor still stores the Gradcracker job URL, so those postings remain usable even when the final application URL is unavailable.

## Related pages

- [Extractors Overview](/docs/next/extractors/overview)
- [Pipeline Run](/docs/next/features/pipeline-run)
- [Add an Extractor](/docs/next/workflows/add-an-extractor)
