---
id: overview
title: Extractors Overview
description: Technical index of supported extractors and how they work.
sidebar_position: 1
---

This page helps you choose the right extractor for your run, understand key constraints, and navigate to detailed technical guides.

## Extractor chooser

| Extractor | Best use case | Core constraints/dependencies | Notable controls | Output/behavior notes |
| --- | --- | --- | --- | --- |
| [Gradcracker](/docs/next/extractors/gradcracker) | UK graduate roles from Gradcracker | Crawling stability depends on page structure and anti-bot behavior; tuned for low concurrency | `GRADCRACKER_SEARCH_TERMS`, `GRADCRACKER_MAX_JOBS_PER_TERM`, `JOBOPS_SKIP_APPLY_FOR_EXISTING` | Scrapes listing metadata, then detail pages and apply URL resolution |
| [JobSpy](/docs/next/extractors/jobspy) | Multi-source discovery (Indeed, LinkedIn, Glassdoor) | Requires Python wrapper execution per term; source availability and quality vary by site/location | `JOBSPY_SITES`, `JOBSPY_SEARCH_TERMS`, `JOBSPY_RESULTS_WANTED`, `JOBSPY_HOURS_OLD`, `JOBSPY_LINKEDIN_FETCH_DESCRIPTION` | Produces JSON per term, then orchestrator normalizes and de-duplicates by `jobUrl` |
| [UKVisaJobs](/docs/next/extractors/ukvisajobs) | UK visa sponsorship-focused roles | Requires authenticated session and periodic token/cookie refresh | `UKVISAJOBS_EMAIL`, `UKVISAJOBS_PASSWORD`, `UKVISAJOBS_MAX_JOBS`, `UKVISAJOBS_SEARCH_KEYWORD` | API pagination + dataset output; orchestrator de-dupes and may fetch missing descriptions |
| [Manual Import](/docs/next/extractors/manual) | One-off jobs not covered by scrapers | Inference quality depends on model/provider and input quality; some URLs cannot be fetched reliably | App/API endpoints (`/api/manual-jobs/infer`, `/api/manual-jobs/import`) | Accepts text/HTML/URL, runs inference, then saves and scores job after review |

## Which extractor should I use?

- Use **JobSpy** for broad first-pass sourcing across common boards.
- Use **Gradcracker** when targeting graduate pipelines in the UK.
- Use **UKVisaJobs** for sponsorship-specific UK searches.
- Use **Manual Import** when you already have a specific posting and need direct import.

Many runs combine sources: broad discovery first, then manual import for high-priority jobs that scraping misses.

## Related extractor docs

- [Gradcracker](/docs/next/extractors/gradcracker)
- [JobSpy](/docs/next/extractors/jobspy)
- [UKVisaJobs](/docs/next/extractors/ukvisajobs)
- [Manual Import](/docs/next/extractors/manual)
