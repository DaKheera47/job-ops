---
id: job-search-bar
title: Job Search Bar
description: Use the global job search/command bar to find and open jobs fast, with optional status locking.
sidebar_position: 3
---

The Job Search Bar is the quickest way to jump to any job from the Jobs page.

![Job search command bar](/img/features/job-search-bar.png)

## Open it

Use either:

- keyboard shortcut: `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux)
- the **Search** button in the Jobs page filter row

## What it searches

Search matches job fields with fuzzy ranking:

- title
- company/employer
- location

By default, very low-relevance matches are hidden so results stay focused on likely intent.

Results are grouped by status sections:

- Ready
- Discovered
- Applied
- Other

Selecting a result opens that job in its correct tab automatically.

## Status lock (`@`)

You can lock the search scope to one status:

1. Type `@` plus a status prefix (example: `@rea`, `@app`).
2. Press `Tab` or `Enter` to apply the lock.
3. Continue typing your normal query.

Supported lock targets:

- `ready`
- `discovered`
- `applied`
- `skipped`
- `expired`

Common aliases:

- `ready`: `ready`, `rdy`
- `discovered`: `discovered`, `discover`, `disc`
- `applied`: `applied`, `apply`, `app`
- `skipped`: `skipped`, `skip`, `skp`
- `expired`: `expired`, `expire`, `exp`

## Lock controls

- `Backspace` on an empty query clears the active lock.
- `Esc` clears the active lock while the search dialog stays open.
- Closing the dialog resets lock state.

## When to use this vs filters

- Use **Search Bar** when you already know what role/company you want to jump to quickly.
- Use **Filters** when you want broad narrowing (source, salary, sponsor, sort) for browsing.

## Related pages

- [Orchestrator](./orchestrator)
- [Pipeline Run](./pipeline-run)
- [Find Jobs and Apply Workflow](../workflows/find-jobs-and-apply-workflow)
