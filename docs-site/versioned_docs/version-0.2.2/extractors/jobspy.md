---
id: jobspy
title: JobSpy Extractor
description: How the JobSpy Python wrapper is orchestrated and normalized.
sidebar_position: 3
---

A walkthrough of the JobSpy extractor for Indeed, LinkedIn, and Glassdoor.

Original websites:
- [indeed.com](https://www.indeed.com)
- [linkedin.com/jobs](https://www.linkedin.com/jobs)
- [glassdoor.com](https://www.glassdoor.com)

## Big picture

JobSpy runs as a Python script per search term, writes JSON, then orchestrator ingests and normalizes into internal job shape.

## 1) Inputs and defaults

Key environment variables:

- `JOBSPY_SITES` (default: `indeed,linkedin`)
- `JOBSPY_SEARCH_TERM` (default: `web developer`)
- `JOBSPY_LOCATION` (default: `UK`)
- `JOBSPY_RESULTS_WANTED` (default: `200`)
- `JOBSPY_HOURS_OLD` (default: `72`)
- `JOBSPY_COUNTRY_INDEED` (default: `UK`)
- `JOBSPY_LINKEDIN_FETCH_DESCRIPTION` (default: `true`)
- `JOBSPY_IS_REMOTE` (unset by default)

## 2) Orchestrator flow

The service in `orchestrator/src/server/services/jobspy.ts`:

- Builds search-term list from UI or env
- Runs Python once per term with unique output file
- Reads JSON and maps to `CreateJobInput`
- De-dupes by `jobUrl`
- Deletes temp output files best-effort

## 3) Mapping and cleanup

- Normalizes salary ranges
- Converts empty values to null
- Keeps metadata like skills, ratings, remote flags when available
- Skips rows with invalid site or missing URL

## Notes

- `JOBSPY_SEARCH_TERMS` can be JSON array or `|`, comma, newline-delimited text.
- Set `JOBSPY_LINKEDIN_FETCH_DESCRIPTION=0` to speed runs.
- Temp output files are stored under `data/imports/`.
- If workplace type is only `Remote`, JobSpy runs with `JOBSPY_IS_REMOTE=true`.
- If workplace type includes `Hybrid` or `Onsite`, JobSpy cannot enforce those filters precisely, so the JobSpy-backed sources run without a workplace-type filter and may return broader results.

## Common Problems

- `Hybrid` or `Onsite` was selected, but Indeed, LinkedIn, or Glassdoor still returned remote jobs.
  JobSpy only supports a strict remote toggle. Any workplace-type selection that includes `Hybrid` or `Onsite` broadens those source results.
- A run returned fewer LinkedIn descriptions than expected.
  `JOBSPY_LINKEDIN_FETCH_DESCRIPTION=0` disables description fetching to speed up runs.
- Different cities need different workplace-type filters.
  This is not supported in the current automatic-run flow. JobSpy receives one global workplace-type selection per run/query invocation.