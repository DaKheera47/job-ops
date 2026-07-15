---
id: pipeline-run
title: Run Search
description: How to use Run Search (Automatic vs Manual), natural-language setup, presets, source controls, and advanced run settings.
sidebar_position: 2
---

## What it is

Run Search is the Jobs-page run modal for starting either:

- an **Automatic** job search
- a **Manual** one-job import

For end-to-end sequence, read [Find Jobs and Apply Workflow](/docs/next/workflows/find-jobs-and-apply-workflow).
For manual import internals, read [Manual Import Extractor](/docs/next/extractors/manual).

## Why it exists

The modal provides one place to describe a search, review the generated settings, and control run volume, source compatibility, and processing aggressiveness before consuming compute/time.

It helps you:

- turn a natural-language search brief into editable settings
- choose speed vs depth with presets
- avoid invalid source/country combinations
- understand estimated run cost before starting
- refresh your job list when older discovered jobs have gone stale

## How to use it

1. Open the Jobs page and use the top-right **Run search** control.
2. Choose either **Automatic** or **Manual** tab.
3. For Automatic, describe the search you want or switch to **Configure details**.
4. Review the settings, edit anything you want, then run the search.

### Automatic tab

#### Describe search

The Automatic tab opens on **Describe search** first.

1. Enter a detailed search brief, such as `Find software engineering jobs in Manchester above GBP 60k. Surface backend/API roles, lower-score graduate programmes, and prefer hybrid or remote options.`
2. Select **Generate search settings**.
3. Review the generated settings in **Configure details**.

AI fills the existing controls only. It does not start the search automatically.

The generated plan can update search terms, ranking preferences, country, map radius or cities, workplace type, location scope, match strictness, source selection, preset mode, score threshold, resume count, and max jobs discovered. Incompatible or unavailable sources are removed before settings are applied.

Add as much detail as possible. Mention what the AI should rank higher or lower, such as salary targets, role seniority, visa sponsorship, graduate programmes, domains, commute limits, or preferred responsibilities.

#### Presets

Three presets set defaults for run aggressiveness:

- **Fast**: lower processing volume, higher score threshold
- **Balanced**: middle-ground defaults
- **Detailed**: higher processing volume, lower score threshold

If values are edited manually, the UI shows **Custom**.

The automatic modal remembers the last preset choice and `Max jobs discovered`
value in this browser. If you picked **Custom**, it reopens in Custom mode with
the same values. The pipeline run itself still derives per-source caps from the
saved budget when you start the run.

#### Search area

**Map radius** is the default search-area mode. It does not require an address or postcode.

1. Select a country.
2. Click the map to place the centre, or move the map and select **Use map centre**.
3. Drag the centre marker to move the area.
4. Drag the circle's edge handle, or edit **Radius in miles**, to resize it.

The default radius is `50` miles. The supported range is `1` to `200` miles. Changing the country clears the selected point so that a centre from the previous country is not reused accidentally.

Select **Manual cities** when you prefer the previous multi-city input. Existing installations with saved cities continue to open in Manual cities mode until you explicitly choose another mode.

Map-radius support is applied consistently even when an extractor has no native radius option:

- Hiring Cafe receives the selected coordinates and radius directly.
- JobSpy-backed sources receive the nearest named place plus their native distance option.
- Sources that accept location strings receive up to 25 nearby OpenStreetMap city, town, or village names, ranked by proximity and population.
- Broad sources that cannot accept a location filter are filtered centrally against those nearby place names after discovery.

The last two behaviors are an approximation. For example, a role labelled `Wakefield` can match a 25-mile Leeds search after Wakefield is expanded from the map area. A role labelled only `West Yorkshire` may be rejected because the listing does not provide coordinates or a matching settlement name. The 25-place cap protects extractor request budgets but can omit smaller settlements in a large or dense radius.

When you run a radius search, JobOps sends the centre and radius to the OpenStreetMap Overpass service to resolve nearby place names. OpenStreetMap tile servers also receive normal map-tile requests while the map is visible. If Hiring Cafe is selected, its search request receives the same centre and radius. Coordinates are stored in tenant-scoped settings and are not written to application logs.

#### Country and source compatibility

- Country selection affects which sources are available, but the country list is owned by JobOps rather than by any single extractor.
- Each extractor declares its own supported countries. A country can be selectable even when JobSpy-backed sources do not support it, as long as another selected source can run or locally filter for that country.
- UK-only sources are disabled for non-UK countries.
- Adzuna is available only for its supported countries and when App ID/App Key are configured in Settings.
- Glassdoor can be enabled only when the selected country supports Glassdoor and either a map point or at least one manual city is set.

Incompatible sources are disabled with explanatory tooltips.

#### Advanced settings

- **Resumes tailored** (`topN`)
- **Min suitability score**
- **Max jobs discovered** (run budget cap)
- `Max jobs discovered` accepts values from `50` to `1000` in the UI.
- **Search area** (`Map radius` by default, with `Manual cities` as the fallback)
- **Workplace type** (`Remote`, `Hybrid`, `Onsite`)

Workplace type applies globally to the run across all search terms and locations.

Manual cities only applies when you explicitly add one or more cities. Leaving it empty does not inject a hidden UK fallback or fake city value.

Source behavior differs:

- Hiring Cafe and startup.jobs support all three workplace types directly.
- Indeed, LinkedIn, and Glassdoor are backed by JobSpy and only support strict remote filtering.
- If workplace type is set to `Remote` only, JobSpy runs with a remote-only filter.
- If `Hybrid` or `Onsite` is included, JobSpy sources remain enabled but may return broader results.

#### Search terms

- Add terms with Enter or commas.
- Multiple terms increase discovery breadth and runtime.
- At least one search term is required.

#### Estimate and run gating

The footer estimate shows expected discovered jobs and resume-processing range.

`Run search` is disabled when:

- a run is already in progress
- required save/run work is still in progress
- no compatible sources are selected
- no search terms are present
- no country is selected
- Map radius is selected but no centre point has been placed

### Manual tab

Manual mode opens direct import flow in the same modal.

Use it when you already have a specific job description or link and do not want full discovery.

For accepted input formats, inference behavior, and limits, see [Manual Import Extractor](/docs/next/extractors/manual).

## Common problems

### Start button stays disabled

- Ensure at least one search term is present.
- Ensure at least one compatible source is selected.
- Select a country and, in Map radius mode, place a centre point.
- Wait for active save/run operations to finish.

### Radius search cannot resolve nearby places

- Try the run again; the OpenStreetMap Overpass service can be temporarily busy.
- Reduce a very large radius.
- Switch to **Manual cities** if you need to run without the nearby-place service.

### Glassdoor cannot be enabled

- Verify selected country supports Glassdoor.
- Place a map centre or switch to Manual cities and add at least one city.

### Adzuna is not selectable

- Set `Adzuna App ID` and `Adzuna App Key` in **Settings > Environment & Workspaces**.
- Verify the selected country is one of Adzuna's supported markets.

### Run takes longer than expected

- Reduce term count.
- Use `Fast` preset or lower `Max jobs discovered`.
- Disable high-cost source combinations where acceptable.

### Older jobs look expired or stale

- Run the search again before reviewing or applying.
- Existing discovered jobs are not automatically refreshed in the background.
- A new run fetches current listings so you can work from fresher results.

### JobSpy results are broader than the selected workplace type

- Indeed, LinkedIn, and Glassdoor only support strict remote filtering in this flow.
- Use `Remote` only when you need JobSpy sources filtered tightly.
- Hybrid or onsite selections are honored by Hiring Cafe and startup.jobs, but JobSpy-backed sources may still include broader results.

## Related pages

- [Find Jobs and Apply Workflow](/docs/next/workflows/find-jobs-and-apply-workflow)
- [Manual Import Extractor](/docs/next/extractors/manual)
- [Orchestrator](/docs/next/features/orchestrator)
- [Overview](/docs/next/features/overview)
