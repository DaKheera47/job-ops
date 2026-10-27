---
id: jobspy
title: JobSpy Extractor
description: Search Indeed, LinkedIn, and Glassdoor with JobSpy and understand location filtering.
sidebar_position: 3
---

## What it is

JobSpy searches [Indeed](https://www.indeed.com), [LinkedIn](https://www.linkedin.com/jobs), and [Glassdoor](https://www.glassdoor.com). JobOps runs its Python wrapper for each search term and location, then normalizes and imports the results.

## Why it exists

The wrapper lets these sources share your search settings and pipeline. JobOps normalizes salary and location evidence, removes duplicate URLs, and applies your location preferences before importing jobs.

## How to use it

1. In Settings, select a country and enter your search terms.
2. Add cities if you want a city search, or use Map radius mode to search nearby places.
3. Select Indeed, LinkedIn, or Glassdoor in the search sources and run the pipeline.
4. Check the saved run details for source errors and the number of jobs discovered.

Indeed and Glassdoor receive the selected country through `country_indeed`. LinkedIn receives a country-qualified location: for example, `New York City, united states`. Without a city, LinkedIn receives the selected country alone.

JobOps recognizes country suffixes such as `US` and `USA` in results like `New York, NY, US`. LinkedIn result labels often omit the country, so JobOps retains the country from that run's qualified native search. An explicit country returned by the source takes precedence over the search country. Ambiguous city/state pairs such as `San Francisco, CA` are not treated as Canadian country evidence.

For manual runs, these environment variables control the Python wrapper:

```bash
JOBSPY_SITES=indeed,linkedin
JOBSPY_SEARCH_TERM="software engineer"
JOBSPY_LOCATION="New York City"
JOBSPY_LINKEDIN_LOCATION="New York City, United States"
JOBSPY_COUNTRY_INDEED="united states"
JOBSPY_RESULTS_WANTED=200
JOBSPY_HOURS_OLD=72
```

Defaults: sites are `indeed,linkedin`, the search term is `web developer`, the location is empty, the result allowance is `200`, and the age limit is `72` hours. The pipeline can override the result allowance with its run budget. No hidden UK location is added.

`JOBSPY_SEARCH_TERMS` accepts a JSON array or text separated by `|`, commas, or newlines. Set `JOBSPY_LINKEDIN_FETCH_DESCRIPTION=0` to skip LinkedIn description fetching; the default is enabled. Temporary files are written under the extractor's `storage/imports/` directory and deleted after successful ingestion.

In Map radius mode, JobOps searches named cities and towns within the selected circle, shares the result allowance across those places, and centrally filters the results.

## Common problems

- **A search completed without adding jobs.** Check its saved details for source errors. Jobs can also be removed by location filtering or skipped because their URLs already exist. A completed run does not guarantee new listings.
- **Hybrid or onsite searches return remote jobs.** JobSpy only provides a strict remote toggle. Remote-only searches enable it; selections containing hybrid or onsite run without that toggle and can return broader results.
- **LinkedIn descriptions are missing.** Check whether `JOBSPY_LINKEDIN_FETCH_DESCRIPTION` is disabled.
- **Different cities need different workplace filters.** One workplace selection applies to every query in a run.

## Related pages

- [Run a pipeline](/docs/features/pipeline-run)
- [Settings](/docs/features/settings)
- [Extractor overview](/docs/extractors/overview)
