---
id: keyboard-shortcuts
title: Keyboard Shortcuts
description: Complete keyboard shortcut reference for the Jobs page, including tab-scoped actions and help/search toggles.
sidebar_position: 4
---

This page documents keyboard shortcuts available on the Jobs page.

## Open shortcut help

Use `?` to toggle the keyboard shortcut dialog.

The dialog:

- shows shortcuts for your current tab context
- groups shortcuts by Navigation, Actions, Tabs, and General
- is shown automatically once for first-time users

## Bottom shortcut hint bar

On desktop (`lg+`), hold `Control` to reveal the bottom shortcut hint bar.

It shows the same tab-scoped shortcuts in a compact layout.

## Global navigation shortcuts

- `j` or `ArrowDown`: next job
- `k` or `ArrowUp`: previous job
- `1`: Ready tab
- `2`: Discovered tab
- `3`: Applied tab
- `4`: All Jobs tab
- `ArrowLeft`: previous tab
- `ArrowRight`: next tab

## Search and help shortcuts

- `Cmd+K` / `Ctrl+K`: open job search bar
- `/`: open job search bar
- `?`: toggle keyboard shortcut help dialog

For search lock behavior (`@ready`, `@app`, etc.), see [Job Search Bar](./job-search-bar).

## Context action shortcuts

### Available in `discovered` and `ready`

- `s`: skip job

### Available in `discovered`

- `r`: move to Ready

Note: if you have multi-select active, `r` runs bulk move-to-ready.

### Available in `ready`

- `a`: mark applied
- `p`: view PDF
- `d`: download PDF

### Available in all tabs (when applicable)

- `o`: open job listing
- `x`: toggle select current job
- `Esc`: clear selection

## Shortcut availability rules

Shortcuts are disabled while blocking modals are open (for example Run modal, Filters, drawer states).

Search (`/`) and Help (`?`) can still open their own dialogs when other blocking dialogs are not active.

## Related pages

- [Job Search Bar](./job-search-bar)
- [Orchestrator](./orchestrator)
- [Pipeline Run](./pipeline-run)
