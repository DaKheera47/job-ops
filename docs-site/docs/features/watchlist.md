---
id: watchlist
title: Watchlist
description: Review watched careers-source roles, ignore irrelevant rows, and move matching jobs into the workspace.
sidebar_position: 14
---

## What it is

Watchlist is a review page for roles fetched from configured company career sources.

Watching a company means JobOps saves that company's careers source in your Watchlist and checks it again when you return, so you can review newly surfaced roles over time. It does not mean JobOps watches every hiring channel from that company, sends alerts automatically, or applies on your behalf.

Each fetched row has one effective state:

- `new`: visible by default and ready to review
- `ignored`: hidden by default
- `moved_to_workspace`: already imported into the JobOps workspace

## Core concepts

### Watching a company

Watching a company means watching that company's saved careers source in Watchlist.

JobOps stores the selected careers source in your workspace and re-checks it when you reopen Watchlist. This gives you a repeatable review loop for newly surfaced roles from that company.

It does not mean:

- watching every hiring channel from that company
- background crawling across the internet
- automatic alerts
- automatic applications

### Catalog source

A catalog source is a company already curated into the built-in Watchlist picker.

If you choose a company from the searchable company list, you are adding a catalog source. These shared entries come from JobOps' maintained source catalog.

### Custom source URL

A custom source URL is a careers board you paste manually for your own workspace.

If the company is not in the built-in picker yet, you can choose the source type's custom URL option and save that public careers page directly. That custom source stays in your workspace unless it is later added to the shared catalog.

Each source type owns its own URL rules and on-screen copy. Watchlist supports Workday, BambooHR, Greenhouse, and Ashby. Choose the source type that matches the company's careers board.

### Baseline check

The baseline check is the first successful Watchlist fetch for your saved sources.

JobOps uses that first successful check as the reference point for future `New since last check` badges. Before the baseline exists, there is nothing older to compare against.

### Ignored role

An ignored role is a Watchlist row hidden from your default review list for that user and workspace.

Ignoring a role does not delete it from the source website or from JobOps storage. It only removes that row from the default visible list until you choose to show ignored rows again.

## Why it exists

Watchlist helps you scan recurring roles from watched company sources without repeatedly seeing the same irrelevant jobs.

Ignored rows and watchlist check history are stored per user inside the active workspace. Jobs already imported into the workspace are detected from the source adapter's canonical source key and external job ID, so they stay visible as workspace jobs even if you ignored the same external role earlier.

## How to use it

1. Open **Watchlist** from the app navigation.
2. Click **Add source**.
3. Use **Choose company** to search the built-in company list, or pick the source type's custom URL option.
4. If you chose a custom URL, paste a supported public careers URL. For Workday, use a URL like `https://company.wd1.myworkdayjobs.com/External`. For BambooHR, use a URL like `https://company.bamboohr.com/careers`. For Ashby, use `https://jobs.ashbyhq.com/company` or the company's public careers page.
5. Click **Save sources**.
6. Review the visible rows.
7. Reopen Watchlist later to see roles marked **New since last check**.
8. Click **Ignore** on a role you do not want to keep seeing.
9. Turn on **Show ignored** to reveal ignored rows.
10. Click **Unignore** to restore an ignored role to the default visible list.
11. Click **Move to workspace** to import a new role.

Rows already imported into JobOps show **Already in workspace** and **Open workspace job**.

When you add a custom source URL, JobOps asks that source adapter to derive a readable company label. If the adapter cannot derive a better label, the URL may still be the clearest identifier.

### Source URL rules

- You can save up to 50 watched sources per user and workspace.
- Use the public careers URL, not an individual job posting URL.
- JobOps validates the URL through the selected source adapter when you save sources.
- Built-in catalog companies are saved as curated sources.
- Custom URLs are saved only in your workspace selections unless a contributor adds them to the shared catalog.
- Workday, BambooHR, Greenhouse, and Ashby are available Watchlist adapters. Additional source types can be added without changing the Watchlist page.

### Ashby careers boards

1. Choose **Ashby** when adding a custom source.
2. Paste an Ashby board URL, such as `https://jobs.ashbyhq.com/linear`, or a company careers URL, such as `https://linear.app/careers`.
3. Click **Save sources**. An Ashby job or application URL is also accepted; saving watches the whole board, not just that posting.

JobOps uses Ashby's public posting API without credentials. It reads all listed jobs, including their descriptions, primary and secondary locations, and available salary summaries. Hybrid roles stay distinct from fully remote roles. A board is fetched once and reused for up to 60 seconds for the same user and workspace when preparing descriptions and import drafts.

For company URLs, JobOps uses verified catalog aliases or looks for an explicit Ashby board reference in the public page and at most two linked job pages on the same site. It does not execute page scripts, guess a board from the company name, or crawl the whole website. If the page references several boards, paste the exact Ashby board URL you want to watch.

The built-in Ashby catalog includes Ashby, Cursor, ElevenLabs, Linear, Lovable, Notion, OpenAI, Ramp, Supabase, and Vanta. Cursor uses its own application pages; JobOps matches its public posting IDs to actual company job links instead of using unavailable Ashby-hosted links. If that mapping cannot be verified, the source shows an error.

Each source request has a 30-second deadline. Public feeds are limited to 25 MiB and discovery pages to 5 MiB; oversized or invalid responses show an error rather than a partial job list. Collection sends no profile, resume, application answers, or authenticated cookies to Ashby or the company website. Moving a job into the workspace does not submit an application.

## Common problems

### A role disappeared

Turn on **Show ignored**. If the row has an `Ignored` badge, click **Unignore** to restore it.

### I do not see any `New since last check` badges yet

The first successful Watchlist fetch creates your personal baseline. Open the page again later to compare the latest results against that saved check.

### A role still appears after being imported

Imported roles stay visible intentionally. They show **Already in workspace** so you can open the existing workspace job instead of importing a duplicate.

### A duplicate import is blocked

JobOps uses the source adapter's canonical source key plus the external job ID as the dedupe key, for example `workday:autodesk` and `26WD97952`. Open the existing workspace job from the Watchlist row.

### My custom URL is rejected

- Make sure you pasted a supported public careers site URL, not a specific job page.
- Confirm the URL still opens in the browser without requiring an authenticated employee session.
- If the company is missing from the built-in list, you can still use the source type's custom URL option when that adapter supports custom sources.

### My company uses Ashby, but detection fails or no jobs appear

Paste the company's `https://jobs.ashbyhq.com/company` board URL directly. An Ashby mention on a website does not guarantee that its public posting feed is available. A successful empty feed means that feed returned no listed jobs; the company may show other roles on its own website. Private or authenticated pages are not supported.

### An Ashby application link no longer works

Open the company's careers page to check the current destination. A job can disappear or its application page can move after the latest check. Existing workspace jobs are retained. Cursor's company links are verified against its careers-page posting IDs; an incomplete mapping requires a new successful check.

## Related pages

- [Orchestrator](/docs/next/features/orchestrator)
- [Job search bar](/docs/next/features/job-search-bar)
- [Pipeline run](/docs/next/features/pipeline-run)
