---
id: pipeline-run
title: Pipeline Run
description: How to use Run Mode (Automatic vs Manual), presets, source controls, and advanced run settings.
sidebar_position: 2
---

## What it is

Pipeline Run is the Jobs-page run modal for starting either:

- an **Automatic** pipeline run
- a **Manual** one-job import

For end-to-end sequence, read [Find Jobs and Apply Workflow](/docs/next/workflows/find-jobs-and-apply-workflow).
For manual import internals, read [Manual Import Extractor](/docs/next/extractors/manual).

## Why it exists

The modal provides one place to control run volume, source compatibility, and processing aggressiveness before consuming compute/time.

It helps you:

- choose speed vs depth with presets
- avoid invalid source/country combinations
- understand estimated run cost before starting

## How to use it

1. Open the Jobs page and use the top-right run control.
2. Choose either **Automatic** or **Manual** tab.
3. Configure required inputs and start run.

### Automatic tab

#### Presets

Three presets set defaults for run aggressiveness:

- **Fast**: lower processing volume, higher score threshold
- **Balanced**: middle-ground defaults
- **Detailed**: higher processing volume, lower score threshold

If values are edited manually, the UI shows **Custom**.

#### Country and source compatibility

- Country selection affects which sources are available.
- UK-only sources are disabled for non-UK countries.
- Adzuna is available only for its supported countries and when App ID/App Key are configured in Settings.
- Glassdoor can be enabled only when:
  - selected country supports Glassdoor
  - at least one **Search city** is set in Advanced settings

Incompatible sources are disabled with explanatory tooltips.

#### Advanced settings

- **Resumes tailored** (`topN`)
- **Min suitability score**
- **Max jobs discovered** (run budget cap)
- **Search cities** (optional multi-city input; empty by default; required for Glassdoor)
- **Workplace type** (`Remote`, `Hybrid`, `Onsite`)

Workplace type applies globally to the run across all search terms and locations.

Search cities only applies when you explicitly add one or more cities. Leaving it empty does not add a hidden country-level location filter.

Source behavior differs:

- Hiring Cafe and startup.jobs support all three workplace types directly.
- Indeed, LinkedIn, and Glassdoor are backed by JobSpy and only support strict remote filtering.
- If workplace type is set to `Remote` only, JobSpy runs with a remote-only filter.
- If `Hybrid` or `Onsite` is included, JobSpy sources remain enabled but may return broader results.

#### Search terms

- Add terms with Enter or commas.
- Multiple terms increase discovery breadth and runtime.
- At least one search term is required.

#### Estimate and run gating

The footer estimate shows expected discovered jobs and resume-processing range.

`Start run now` is disabled when:

- a run is already in progress
- required save/run work is still in progress
- no compatible sources are selected
- no search terms are present

### Manual tab

Manual mode opens direct import flow in the same modal.

Use it when you already have a specific job description or link and do not want full discovery.

For accepted input formats, inference behavior, and limits, see [Manual Import Extractor](/docs/next/extractors/manual).

## Common problems

### Start button stays disabled

- Ensure at least one search term is present.
- Ensure at least one compatible source is selected.
- Wait for active save/run operations to finish.

### Glassdoor cannot be enabled

- Verify selected country supports Glassdoor.
- Set at least one Search city in Advanced settings.

### Adzuna is not selectable

- Set `Adzuna App ID` and `Adzuna App Key` in **Settings > Environment & Accounts**.
- Verify the selected country is one of Adzuna's supported markets.

### Run takes longer than expected

- Reduce term count.
- Use `Fast` preset or lower `Max jobs discovered`.
- Disable high-cost source combinations where acceptable.

### JobSpy results are broader than the selected workplace type

- Indeed, LinkedIn, and Glassdoor only support strict remote filtering in this flow.
- Use `Remote` only when you need JobSpy sources filtered tightly.
- Hybrid or onsite selections are honored by Hiring Cafe and startup.jobs, but JobSpy-backed sources may still include broader results.

## Related pages

- [Find Jobs and Apply Workflow](/docs/next/workflows/find-jobs-and-apply-workflow)
- [Manual Import Extractor](/docs/next/extractors/manual)
- [Orchestrator](/docs/next/features/orchestrator)
- [Overview](/docs/next/features/overview)
