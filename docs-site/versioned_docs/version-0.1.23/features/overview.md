---
id: overview
title: Overview
description: Dashboard analytics for application volume and conversion over selectable time windows.
sidebar_position: 1
---

## What it is

The Overview page is the analytics dashboard for your pipeline outcomes.

![Overview dashboard](/img/features/overview-dashboard.png)

It visualizes:

- Applications per day
- Application-to-response conversion
- Funnel progression (Applied, Screening, Interview, Offer, Rejected)

### Graph-level views

![Applications per day graph](/img/features/overview-applications-graph.png)

![Funnel progression graph](/img/features/overview-funnel-graph.png)

## Why it exists

The page helps you measure whether your current sourcing and tailoring approach is producing responses, not just applications.

Use it to quickly answer:

- Are application volumes increasing or dropping?
- Is response conversion improving?
- Where are applications stalling in the funnel?

## How to use it

1. Open **Overview**.
2. Select a time window (`7d`, `14d`, `30d`, `90d`) in the top-right selector.
3. Review:
   - **Applications per day** for volume trend
   - **Application → Response Conversion** for quality/outcome trend
4. Compare periods and adjust your sourcing terms, filters, or tailoring strategy.

### Data and calculation defaults

- Default window is `30d`.
- Only jobs in statuses `applied` and `in_progress` are used as input.
- Conversion counts any positive response-stage event (for example recruiter screen, assessment, interview stages, or offer).
- Conversion trend chart uses a rolling window up to 7 days.

## Common problems

### Empty charts

- Verify you have jobs with `appliedAt` timestamps.
- The selected duration may exclude your recent activity.

### Conversion appears low

- Conversion only counts jobs that reached response stages.
- If stage events are missing or delayed, conversion will under-report.

### Trend icons look counterintuitive

- Volume trend compares first-half vs second-half averages in the selected window.
- Changing the time window can materially change trend direction.

## Related pages

- [Orchestrator](/docs/next/features/orchestrator)
- [Post-Application Tracking](/docs/next/features/post-application-tracking)
- [Troubleshooting](/docs/next/troubleshooting/common-problems)
