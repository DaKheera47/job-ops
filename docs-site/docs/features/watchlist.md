---
id: watchlist
title: Watchlist
description: Review watched Workday roles, ignore irrelevant rows, and move matching jobs into the workspace.
sidebar_position: 14
---

## What it is

Watchlist is a review page for roles fetched from configured Workday career sites.

Each fetched row has one effective state:

- `new`: visible by default and ready to review
- `ignored`: hidden by default
- `moved_to_workspace`: already imported into the JobOps workspace

## Why it exists

Watchlist helps you scan recurring external roles without repeatedly seeing the same irrelevant jobs.

Ignored rows are stored in the workspace database, scoped to the active workspace. Jobs already imported into the workspace are detected from the Workday source and external job ID, so they stay visible as workspace jobs even if an ignored row exists for the same external role.

## How to use it

1. Open **Watchlist** from the app navigation.
2. Review the visible Workday rows.
3. Click **Ignore** on a role you do not want to keep seeing.
4. Turn on **Show ignored** to reveal ignored rows.
5. Click **Unignore** to restore an ignored role to the default visible list.
6. Click **Move to workspace** to import a new role.

Rows already imported into JobOps show **Already in workspace** and **Open workspace job**.

## Common problems

### A role disappeared

Turn on **Show ignored**. If the row has an `Ignored` badge, click **Unignore** to restore it.

### A role still appears after being imported

Imported roles stay visible intentionally. They show **Already in workspace** so you can open the existing workspace job instead of importing a duplicate.

### A duplicate import is blocked

JobOps uses the Workday source plus the external job ID as the dedupe key, for example `workday:autodesk` and `26WD97952`. Open the existing workspace job from the Watchlist row.

## Related pages

- [Orchestrator](/docs/next/features/orchestrator)
- [Job search bar](/docs/next/features/job-search-bar)
- [Pipeline run](/docs/next/features/pipeline-run)
