---
id: pipeline-run
title: Pipeline Run
description: How to use Run Mode (Automatic vs Manual), presets, source controls, and advanced run settings.
sidebar_position: 2
---

This page documents the **Pipeline Run controls** in the Jobs page run modal.

For end-to-end sequence, read [Find Jobs and Apply Workflow](../workflows/find-jobs-and-apply-workflow).
For manual import internals, read [Manual Import Extractor](../extractors/manual).

## What this page covers

- Automatic vs Manual run modes
- Presets and advanced knobs in Automatic mode
- Country/source compatibility and Glassdoor behavior
- Run estimates and when the run button is disabled

## Open the Run modal

From the Jobs page, use the top-right run control.

The modal has two tabs:

- **Automatic**: configure and start a full pipeline run
- **Manual**: import one job directly

## Automatic tab

### Presets

Three presets set default values for run aggressiveness:

- **Fast**: lower processing volume, higher score threshold
- **Balanced**: middle-ground defaults
- **Detailed**: higher processing volume, lower score threshold

If you edit values manually, the UI shows **Custom**.

### Country and source compatibility

- Country selection affects which sources are available.
- UK-only sources are disabled for non-UK countries.
- Glassdoor can be enabled only when:
  - selected country supports Glassdoor
  - a **Glassdoor city** is set in Advanced settings

Incompatible sources are disabled with tooltips explaining why.

### Advanced settings

Advanced settings lets you tune:

- **Resumes tailored** (`topN`)
- **Min suitability score**
- **Max jobs discovered** (run budget cap)
- **Glassdoor city** (required only for Glassdoor)

### Search terms

- Add terms by pressing Enter or using commas.
- Multiple terms increase discovery breadth and total runtime.
- At least one search term is required to start a run.

### Estimate + run gating

The footer estimate shows expected discovered jobs and resume processing range.

`Start run now` is disabled when:

- a run is already in progress
- required save/run work is still in progress
- no compatible sources are selected
- no search terms are present

## Manual tab

Manual mode opens the direct import flow in the same modal.

Use this when you already have a specific job description/link and do not want a full pipeline run.

For accepted input formats, inference behavior, and limits, see [Manual Import Extractor](../extractors/manual).

## Scope boundary

This page focuses on run controls only. It intentionally does not duplicate:

- end-to-end application sequencing: [Find Jobs and Apply Workflow](../workflows/find-jobs-and-apply-workflow)
- manual import API/storage details: [Manual Import Extractor](../extractors/manual)
