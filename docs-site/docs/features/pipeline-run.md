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
  - a **Glassdoor city** is set in Advanced settings

Incompatible sources are disabled with explanatory tooltips.

#### Advanced settings

- **Resumes tailored** (`topN`)
- **Min suitability score**
- **Max jobs discovered** (run budget cap)
- **Glassdoor city** (required only for Glassdoor)

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
- Set a Glassdoor city in Advanced settings.

### Adzuna is not selectable

- Set `Adzuna App ID` and `Adzuna App Key` in **Settings > Environment & Accounts**.
- Verify the selected country is one of Adzuna's supported markets.

### Run takes longer than expected

- Reduce term count.
- Use `Fast` preset or lower `Max jobs discovered`.
- Disable high-cost source combinations where acceptable.

## Related pages

- [Find Jobs and Apply Workflow](/docs/next/workflows/find-jobs-and-apply-workflow)
- [Manual Import Extractor](/docs/next/extractors/manual)
- [Orchestrator](/docs/next/features/orchestrator)
- [Overview](/docs/next/features/overview)
