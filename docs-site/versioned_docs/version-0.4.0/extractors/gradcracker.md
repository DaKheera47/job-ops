---
id: gradcracker
title: Gradcracker Extractor
description: How the Gradcracker crawler builds search URLs and extracts jobs.
sidebar_position: 2
---

A plain-English walkthrough of the Gradcracker extractor in `extractors/gradcracker`.

Original website: [gradcracker.com](https://www.gradcracker.com)

## Big picture

The crawler builds search URLs, scrapes listing pages, then opens job details for descriptions and apply URLs.

## 1) Build search URLs

- Combines UK regions with role terms.
- Defaults include roles such as `web-development` and `software-systems`.
- `GRADCRACKER_SEARCH_TERMS` overrides defaults.

## 2) Crawl list pages

- Waits for job cards (`article[wire:key]`).
- Extracts title, employer, discipline, deadline, salary, location, degree, start date.
- Queues job detail pages.

Controls:

- `GRADCRACKER_MAX_JOBS_PER_TERM`
- `JOBOPS_SKIP_APPLY_FOR_EXISTING=1`
- `JOBOPS_EXISTING_JOB_URLS` / `JOBOPS_EXISTING_JOB_URLS_FILE`

## 3) Crawl detail pages

- Waits for `.body-content`
- Captures full description text
- Clicks apply button to resolve final application URL
- Handles popup and same-tab redirects

## 4) Progress reporting

Set `JOBOPS_EMIT_PROGRESS=1` for structured progress lines consumable by orchestrator UI.

## Notes

- Uses Playwright + Crawlee via Camoufox.
- Low concurrency and longer timeouts for stability.
