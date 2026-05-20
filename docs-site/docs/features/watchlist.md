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

Ignored rows and watchlist check history are stored per user inside the active workspace. Jobs already imported into the workspace are detected from the Workday source and external job ID, so they stay visible as workspace jobs even if you ignored the same external role earlier.

## How to use it

1. Open **Watchlist** from the app navigation.
2. Click **Add source**.
3. Use **Choose company** to search the built-in company list, or pick **Choose your own Workday URL**.
4. If you chose a custom URL, paste the Workday careers URL, for example `https://company.wd1.myworkdayjobs.com/External`.
5. Click **Save sources**.
6. Review the visible Workday rows.
7. Reopen Watchlist later to see roles marked **New since last check**.
8. Click **Ignore** on a role you do not want to keep seeing.
9. Turn on **Show ignored** to reveal ignored rows.
10. Click **Unignore** to restore an ignored role to the default visible list.
11. Click **Move to workspace** to import a new role.

Rows already imported into JobOps show **Already in workspace** and **Open workspace job**.

When you add a custom Workday URL, JobOps tries to derive a readable company label from the Workday tenant or site slug. If the slug is too generic, the URL may still be the clearest identifier.

### Workday URL rules

- The custom source flow is for Workday career sites only.
- Use the public careers URL, not an individual job posting URL.
- JobOps validates the URL when you save sources.
- Built-in catalog companies are saved as curated sources.
- Custom Workday URLs are saved only in your workspace selections unless a contributor adds them to the shared catalog.

## Common problems

### A role disappeared

Turn on **Show ignored**. If the row has an `Ignored` badge, click **Unignore** to restore it.

### I do not see any `New since last check` badges yet

The first successful Watchlist fetch creates your personal baseline. Open the page again later to compare the latest results against that saved check.

### A role still appears after being imported

Imported roles stay visible intentionally. They show **Already in workspace** so you can open the existing workspace job instead of importing a duplicate.

### A duplicate import is blocked

JobOps uses the Workday source plus the external job ID as the dedupe key, for example `workday:autodesk` and `26WD97952`. Open the existing workspace job from the Watchlist row.

### My Workday URL is rejected

- Make sure you pasted the Workday careers site URL, not a specific job page.
- Confirm the URL still opens in the browser without requiring an authenticated employee session.
- If the company is missing from the built-in list, you can still use **Choose your own Workday URL**.

## Related pages

- [Orchestrator](/docs/next/features/orchestrator)
- [Job search bar](/docs/next/features/job-search-bar)
- [Pipeline run](/docs/next/features/pipeline-run)
