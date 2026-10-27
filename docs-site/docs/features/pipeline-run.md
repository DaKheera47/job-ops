---
id: pipeline-run
title: Find jobs
description: Describe a search or enter its criteria, review the same editable plan, then start searching.
sidebar_position: 2
---

## What it is

**Find jobs** discovers new opportunities. Describe what you want with AI assistance, or enter the search criteria yourself. Both lead to the same editable review screen.

**Add a job** is a separate action for a link, description, or PDF you already have. It does not run discovery.

For end-to-end sequence, read [Find Jobs and Apply Workflow](/docs/next/workflows/find-jobs-and-apply-workflow).
For manual import internals, read [Manual Import Extractor](/docs/next/extractors/manual).

## Why it exists

The search review keeps your criteria visible before any discovery starts. Expand only the details you want to change.

It helps you:

- turn a natural-language search brief into editable settings
- choose speed vs depth with presets
- avoid invalid source/country combinations
- understand estimated run cost before starting
- refresh your job list when older discovered jobs have gone stale

## How to use it

1. Open **Jobs > Find jobs**.
2. Describe your search, for example: `Graduate software engineering jobs in Manchester. Prefer backend work and hybrid or remote roles.`
3. Select **Build my search**. To skip AI setup, select **Enter search details instead**.
4. In **Review your search**, expand **Roles**, **Location & work arrangement**, **Ranking preferences**, or **Sources** to edit them.
5. Select **Start search** when the criteria are ready.

AI fills the same fields you can edit yourself; it never starts discovery. **Edit description** returns to your brief while keeping the criteria you have edited. Rebuilding uses those current criteria as context.

The review shows compact summaries. **Search notes** contains any AI assumptions or limitations, and **Unavailable sources** explains why particular boards cannot run. Both are collapsed by default. Ranking preferences influence scores rather than strictly excluding listings, including salary preferences.

If AI setup is unavailable, the review clearly says that the existing criteria were kept. Edit them yourself or return to the description and try again.

### Search settings

#### Presets

Expand **Advanced search settings** to choose a search-depth preset. Three presets set defaults for run aggressiveness:

- **Fast**: lower processing volume, higher score threshold
- **Balanced**: middle-ground defaults
- **Detailed**: higher processing volume, lower score threshold

If values are edited manually, the UI shows **Custom**.

Find jobs remembers the last preset choice and `Max jobs discovered`
value in this browser. If you picked **Custom**, it reopens in Custom mode with
the same values. The pipeline run itself still derives per-source caps from the
saved budget when you start the run.

**Find jobs** always opens search setup. Adding a job does not change that entry point.

#### Search area

**Map radius** is the default search-area mode. It does not require an address or postcode.

1. Click the map to place the centre, or move the map and select **Use map centre**.
2. JobOps detects the country at that point and shows it below the map.
3. Drag the centre marker to move the area and detect the new country.
4. Drag the circle's edge handle, or edit **Radius in miles**, to resize it.

The default radius is `50` miles. The supported range is `1` to `200` miles. In Map radius mode, the map point is authoritative and there is no separate country selector.

After you select or adjust an area, JobOps previews the named cities and towns inside the circle. The location count in **Your search** updates after this lookup and the same result is reused when the search starts.

Select **City list** when you prefer the previous country and multi-city inputs. Existing installations with saved cities continue to open in City list mode until you explicitly choose another mode.

Map-radius support is applied consistently even when an extractor has no native radius option:

- Hiring Cafe receives the selected coordinates and radius directly.
- JobSpy-backed sources receive the nearest named place plus their native distance option.
- Sources that accept location strings receive up to 25 nearby OpenStreetMap city or town names, ranked by proximity and population. If the Overpass service is unavailable, JobOps uses the locality nearest the selected centre instead of failing the whole run.
- Broad sources that cannot accept a location filter are filtered centrally against those nearby place names after discovery.

The last two behaviors are an approximation. For example, a role labelled `Wakefield` can match a 25-mile Leeds search after Wakefield is expanded from the map area. A role labelled only `West Yorkshire` may be rejected because the listing does not provide coordinates or a matching settlement name. Villages are not included in the full-radius Overpass query because those queries regularly time out; reverse geocoding still preserves the locality at the selected centre. The 25-place cap protects extractor request budgets but can omit smaller settlements in a large or dense radius.

When you place or move the centre, JobOps sends it to OpenStreetMap Nominatim to detect the country. When you run a radius search, JobOps sends the centre and radius to the OpenStreetMap Overpass service to resolve nearby place names. OpenStreetMap tile servers also receive normal map-tile requests while the map is visible. If Hiring Cafe is selected, its search request receives the same centre and radius. Coordinates are stored in tenant-scoped settings and are not written to application logs.

#### Country and source compatibility

- The detected map country—or the country selected in City list mode—affects which sources are available, but the country list is owned by JobOps rather than by any single extractor.
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
- **Search area** (`Map radius` by default, with `City list` as the fallback)
- **Workplace type** (`Remote`, `Hybrid`, `Onsite`)

Workplace type applies globally to the run across all search terms and locations.

City list only applies when you explicitly add one or more cities. Leaving it empty does not inject a hidden UK fallback or fake city value.

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

The footer shows role, location, and source counts. If a required field is missing, it explains what to add.

**Start search** is disabled when:

- a run is already in progress
- required save/run work is still in progress
- no compatible sources are selected
- no search terms are present
- no country is selected
- Map radius is selected but no centre point has been placed

#### Monitor a running search

While discovery is running, the Jobs page shows live fanout progress grouped by
search term. Each row reports extractor tasks that are queued, running,
complete, or waiting for a browser check. Some job boards batch locations or
search terms, so several logical units can advance together. The heading cycles
through the active search term, location, and job board one value at a time.

- **Results** is the raw number of jobs returned by completed extractors.
- **Unique** is the number remaining after location/company filters and
  in-run title/employer deduplication.
- A browser-check row pauses only the affected extractor. Use **Solve** to open
  the challenge viewer; other extractors continue running.
- If another Cloudflare challenge appears after a solve, the run shows the new
  browser check and stays paused. Solve each challenge as it appears, or cancel
  the run. Collected jobs are held until all challenged sources finish and the
  run can import complete results.
- After a **Solve** attempt on a Hiring Cafe search-page challenge, **Skip this
  search** keeps jobs found so far and moves to the next Hiring Cafe search term
  or location. It does not skip the whole source. The option does not appear for
  job detail challenges.
- An extractor that does not finish within 10 minutes is marked as failed. The
  remaining extractors continue instead of leaving the run stuck indefinitely.

After discovery, the scoring card shows the job currently being ranked and
updates its counters live. **Exceptional matches** counts jobs with a
suitability score above 90. Importing and processing continue in the background
for now.

### Add a job you already found

Select **Add a job** in the Jobs header. Paste a link or job description, upload a text-based PDF, or choose **URL list** for multiple links. Review the extracted details before adding the job.

For formats and limits, see [Manual Import Extractor](/docs/next/extractors/manual).

## Common problems

### Start button stays disabled

- Ensure at least one search term is present.
- Ensure at least one compatible source is selected.
- Select a country and, in Map radius mode, place a centre point.
- Wait for active save/run operations to finish.

### Search says system admin access is required

- Search settings saved by the Find jobs form are scoped to the signed-in user's workspace and do not require system admin access.
- If the request also changes a protected setting, remove that change or ask a system admin to update it in **Settings**.

### Radius search cannot resolve nearby places

- Try the run again; the OpenStreetMap Overpass service can be temporarily busy.
- Reduce a very large radius.
- Switch to **City list** if you need to run without the nearby-place service.

### Glassdoor cannot be enabled

- Verify selected country supports Glassdoor.
- Place a map centre or switch to City list and add at least one city.

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
