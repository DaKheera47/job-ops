---
id: find-jobs-and-apply-workflow
title: Find Jobs and Apply Workflow
description: Recommended end-to-end pre-application workflow from pipeline run to marking jobs as applied.
sidebar_position: 1
---

## Goal

This guide documents the main intended pre-application workflow in JobOps.

If you follow this order, you get the strongest results from discovery, scoring, tailoring, and tracking.

## Recommended flow (in order)

### 1) Run a pipeline first

From the **Jobs** page, use the top-right pipeline/run control.

What this does:

- fetches jobs from enabled extractors
- scores relevance against your resume/profile
- optionally tailors top jobs and prepares PDFs

Important:

- Some scrapers are slower and can take significant time.
- Larger scrape ranges and more sources increase run duration.

### 2) Configure pipeline advanced settings

In pipeline advanced settings, configure:

- how many jobs to discover (approximate target)
- minimum score threshold for tailoring
- how many jobs should be tailored/generated

This directly controls how many jobs appear downstream in `discovered` and `ready`.

### 3) Review the `Discovered` column

After the run, `discovered` is populated with jobs found by extractors.

For each discovered job:

- review the suitability score
- read the AI fit justification in **Fit Assessment**
- decide whether the opportunity is worth advancing

### 4) Work from `Ready` for applications

`ready` jobs are the primary application queue.

These jobs already have tailored PDFs generated for the specific job description, using the workflow described in [Reactive Resume](../features/reactive-resume).

At this stage:

1. Open job details.
2. Download the tailored PDF.
3. Submit your application externally.

### 5) Mark jobs as applied in JobOps

After submitting, return to JobOps and mark the job as `applied`.

Effects:

- job moves to the `applied` state
- configured completion webhook(s) are triggered
- job is included in overview analytics

This completes the detailed pre-application loop.

## What happens next

Once a job is marked `applied`, it becomes part of:

- pipeline outcome analytics on [Overview](../features/overview)
- optional post-application workflows (inbox/review routing)

## Practical tips

- Start with conservative run sizes while tuning sources.
- Increase tailored-job count only after score thresholds feel calibrated.
- Expect scraper runtime variance by source.
- Keep resume/project context up to date so scoring/tailoring quality stays high.

## Related pages

- [Orchestrator](../features/orchestrator)
- [Reactive Resume](../features/reactive-resume)
- [Settings](../features/settings)
- [Overview](../features/overview)
- [Post-Application Workflow](./post-application-workflow)
- [Post-Application Tracking](../features/post-application-tracking)
