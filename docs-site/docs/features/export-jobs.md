---
id: export-jobs
title: Export Jobs to CSV
description: Download filtered or selected job list rows for spreadsheet review.
sidebar_position: 30
---

## What it is

The jobs list can download a CSV snapshot for Excel, LibreOffice or another spreadsheet app. Export runs locally in your browser using the job rows already loaded for the current account. It makes no additional data requests.

## Why it exists

A spreadsheet makes it easier to review application activity, compare roles and share a selected list without copying rows individually. All matching rows are exported, including rows outside the currently visible virtualized list.

## How to use it

1. Open the jobs list and choose a status tab, filters and sort order.
2. Optionally select the jobs you want to export using their checkboxes.
3. Open **Export CSV** beside the selection count.
4. Choose **Filtered jobs** for all matching rows, or **Selected jobs** for checked rows that still match the current filters. The menu shows each row count.
5. Open the downloaded `jobops-jobs-YYYY-MM-DD-filtered.csv` or `-selected.csv` file in your spreadsheet app.

Exported columns include job ID, title, employer, location, status, outcome, source, job type, salary, score, posted date, deadline, discovered/applied/updated timestamps, listing URL and application URL. Row order follows the current list sort. Timestamps are preserved as stored; the filename uses the download's UTC date.

## Common problems

- **Some checked rows are missing:** selected export includes only rows that match the current filters. Clear filters to export a broader selection.
- **The button is unavailable:** wait for the list to finish refreshing. Empty lists cannot be exported, and selected export needs at least one matching checked job.
- **Non-English text looks wrong:** CSV downloads include a UTF-8 byte-order mark. If needed, import the file as UTF-8 with comma delimiters.
- **Text starts with an apostrophe:** text beginning with spreadsheet formula characters (`=`, `+`, `-` or `@`, including after whitespace) receives a leading apostrophe so spreadsheets treat it as text. This does not change the saved job.
- **Descriptions or notes are missing:** this export deliberately contains list fields only. Full job descriptions, private notes, resumes, documents and email history are excluded. It is a review snapshot, not a complete or restorable backup.

## Related pages

- [Common Problems](/docs/troubleshooting/common-problems)
- [Resume Studio](/docs/features/design-resume)
