# Location Filtering Redesign Spec

## Document Status

- Status: Proposed
- Audience: Product, design, backend, frontend, extractor maintainers
- Scope: Automatic pipeline run location filtering, source compatibility, downstream matching, and diagnostics

## Summary

This document defines the target design for location filtering in JobOps.

The current city and country filtering behavior is inconsistent across the UI, settings persistence, extractor integrations, and downstream pipeline filtering. That inconsistency causes two major user-facing failures:

- users run a pipeline and get no results back even though valid jobs exist
- users run a pipeline and get location-irrelevant results because one layer broadened the query while another layer interpreted the same settings differently

The redesign in this document makes location filtering a first-class, run-scoped domain instead of a loose set of shared strings and legacy fallbacks. It introduces:

- a single structured location intent model
- a shared matching engine
- explicit source capability declarations
- source-specific planning adapters
- structured job-side location evidence
- pre-run and post-run UX that explains behavior without overwhelming users

The desired result is a system that is more predictable, easier to reason about, easier to extend, and much easier to debug.

## Why This Work Exists

Location filtering is one of the most important parts of discovery quality. A user can tolerate some scoring noise, but they quickly lose trust if:

- a Berlin search returns remote jobs from anywhere
- a Germany run yields zero results because valid jobs were filtered out late
- a country-only run quietly becomes a city-only run
- a city filter works on one source and means something totally different on another

Right now the app has several sources of truth for the same concept:

- the automatic-run modal assembles and normalizes location preferences
- settings persist country and cities separately, with legacy aliases
- each extractor interprets location in its own way
- the pipeline re-filters discovered jobs downstream
- some UI-only rules are never validated by the server

That creates hidden complexity. Each individual helper looks small, but the behavior across the system is hard to predict. This redesign replaces that hidden complexity with a more explicit structure.

## Goals

- Eliminate accidental empty runs caused by double-filter drift
- Reduce irrelevant jobs caused by inconsistent source semantics
- Make run behavior deterministic from one validated snapshot
- Give users a clear mental model for location controls
- Keep the happy path simple while preserving deep diagnostics
- Make unsupported source features visible and consistent
- Create an extension-friendly contract for future extractors

## Non-Goals

- This redesign does not attempt to solve generic ranking quality outside location handling
- This redesign does not replace job scoring prompts or readiness scoring
- This redesign does not require every source to support exact city filtering
- This redesign does not require geocoding every job globally on day one

## Product Principles

### 1. Location intent must be explicit

The system should not infer important run behavior from hidden state, legacy settings, or browser defaults without showing that to the user.

### 2. One run, one truth

A pipeline run must execute from a validated run snapshot, not from mutable app-wide settings that may change after the user clicks run.

### 3. Unsupported must never be silent

If a source cannot support a requested feature exactly, the system must either:

- support it natively
- support it through a trustworthy local post-filter
- mark it unsupported and exclude or downgrade it deliberately

Silent broadening is not acceptable.

### 4. Country, region group, and city are different concepts

They must not share the same field or be allowed to masquerade as each other.

### 5. Display strings are not decision data

Human-readable `job.location` text should be presentation output, not the primary logic input for filtering decisions.

### 6. Explain consequences, not internals

The UX should mostly explain what the user will get and why, not dump implementation details.

## Current Problems

### Problem 1: The same location intent is represented differently in different layers

Today the system uses:

- `jobspyCountryIndeed`
- `searchCities`
- `jobspyLocation`
- UI-only country normalization
- extractor-specific aliases and fallback rules

This means the same user intent can behave differently depending on where it is read.

### Problem 2: The pipeline applies location twice

Many extractors already do some form of source-level location handling. After that, the pipeline applies another global location filter. Because the two layers do not use the same semantics, valid jobs can be dropped after discovery.

### Problem 3: Source capability rules are fragmented

Glassdoor city requirements, Adzuna country support, Working Nomads country tokens, and `usa/ca` behavior are spread across different modules. The UI and backend can disagree.

### Problem 4: Legacy compatibility is steering live behavior

The legacy `jobspyLocation` path still affects modern runs. This makes it possible for old values to silently influence new behavior.

### Problem 5: `usa/ca` is a fake country

It behaves like a region-group in some places, a country alias in others, and is remapped away in the UI. This is a modeling problem more than a matching problem.

### Problem 6: Some sources lose useful location evidence too early

Several extractors flatten structured location data into a single display string. Once that happens, later matching gets weaker and more error-prone.

### Problem 7: The UI is trying to protect users with rules that the server does not enforce

This works only if every run originates from that exact modal path. It is not a reliable contract.

## Desired User Experience

### What the user should feel

The run setup should feel simple, legible, and confident.

The user should feel:

- "I can tell what area I am searching."
- "I can tell which sources are precise and which are broader."
- "If something is unsupported, the app tells me before I run."
- "If I get weak results, the app can tell me why."

The user should not feel:

- "I have no idea whether my country selection is actually being used."
- "I picked a city and still got random jobs."
- "I got zero results and I do not know if that is because of source support, settings, or a bug."

### High-level run experience

The location portion of the run modal becomes one coherent experience titled:

`Where should we search?`

The flow should be:

1. Choose a search area
2. Optionally narrow with cities
3. Choose workplace types
4. Choose global remote behavior
5. Review source quality and compatibility
6. Run with a clear summary

### Primary controls

- Search area type:
  - `Worldwide`
  - `Country`
  - `Region group`
- Country picker when search area is `Country`
- Region-group picker when search area is `Region group`
- City chip input as a narrowing layer
- Workplace type toggles:
  - `Remote`
  - `Hybrid`
  - `Onsite`
- Search scope:
  - `Only selected locations`
  - `Selected locations + remote worldwide`
  - `Remote worldwide`
- Match strictness:
  - `Exact matches only`
  - `Include likely matches`

### Browser-detected country behavior

The app may suggest a country, but should not silently apply it.

Desired behavior:

- show a suggestion chip such as `Use United Kingdom`
- show it only when the user has not chosen an explicit search area yet
- never persist browser-detected geography automatically
- never hide the fact that the suggestion is inferred

### Summary sentence

Every valid run configuration should produce a single sentence summary.

Examples:

- `Searching Germany only.`
- `Searching Germany, narrowed to Berlin and Munich.`
- `Searching Germany, narrowed to Berlin and Munich, plus remote jobs worldwide.`
- `Searching North America remote roles, prioritizing Toronto and New York.`
- `Searching worldwide remote roles only.`

### Source chips

Each source should show one compact chip that communicates quality at a glance.

Proposed chip vocabulary:

- `Exact`
- `Broad`
- `Needs city`
- `Limited`
- `Unsupported`

### Inline warnings

Only show inline warnings when there is a conflict, blocker, or meaningful accuracy risk.

Examples:

- `Glassdoor requires at least one city for this setup.`
- `2 sources may return broader regional matches.`
- `Remote filtering is approximate for 1 source.`
- `Startup.jobs may interpret city searches broadly.`

### Details drawer

Users who want more detail can expand a source behavior drawer.

That drawer can show:

- whether the source supports exact country queries
- whether the source supports exact city queries
- whether remote is native or inferred
- whether matching happens upstream, post-fetch, or not at all
- whether the source is being excluded from the current run

This content should not be shown by default.

### Post-run explanation

If the run returns few results or unexpectedly broad results, the app should explain that in plain English.

Examples:

- `Few results because 3 sources could not match Berlin exactly.`
- `Most jobs were dropped because they matched Germany but not your selected cities.`
- `Remote worldwide added 18 jobs outside your selected geography.`

## Domain Model

The redesign introduces a structured shared location domain.

### GeoScope

`GeoScope` represents the broad shape of the user’s geographic selection.

Values:

- `worldwide`
- `country`
- `region_group`

### Region groups

Region groups are not countries. They should be modeled separately.

Initial region-group values:

- `north_america_us_ca`

This replaces the current ambiguous `usa/ca` behavior.

Future region groups can be added deliberately without pretending they are countries.

### LocationIntent

`LocationIntent` is the canonical representation of the user’s requested location behavior for one run.

Proposed shape:

```ts
type GeoScope = "worldwide" | "country" | "region_group";

type SearchScope =
  | "selected_only"
  | "selected_plus_remote_worldwide"
  | "remote_worldwide_prioritize_selected";

type MatchStrictness = "exact_only" | "flexible";

interface LocationIntent {
  geoScope: GeoScope;
  countryKey?: string;
  regionGroupKey?: string;
  cities: string[];
  workplaceTypes: Array<"remote" | "hybrid" | "onsite">;
  searchScope: SearchScope;
  matchStrictness: MatchStrictness;
}
```

Rules:

- `countryKey` is set only when `geoScope === "country"`
- `regionGroupKey` is set only when `geoScope === "region_group"`
- `cities` are always narrowing inputs, never replacements for the broad scope
- `workplaceTypes` and `searchScope` stay part of location intent because they materially affect which jobs are kept

### Canonical country handling

Country normalization should resolve aliases once.

Examples:

- `uk` -> `united kingdom`
- `us` -> `united states`
- `usa` -> `united states`
- `czech republic` -> `czechia`

This normalization should happen in one shared place and nowhere else.

### LocationEvidence

Every discovered job should carry structured evidence that describes what we actually know about its location.

Proposed shape:

```ts
type LocationEvidenceQuality = "exact" | "approximate" | "weak" | "unknown";

interface LocationEvidence {
  rawLocation?: string;
  countryKey?: string;
  city?: string;
  regionHints?: string[];
  isRemote?: boolean;
  isHybrid?: boolean;
  evidenceQuality: LocationEvidenceQuality;
  sourceNotes?: string[];
}
```

Meaning:

- `rawLocation` is the human-meaningful source string
- `countryKey` is the normalized canonical country, if known
- `city` is the normalized city, if known
- `regionHints` contains source-specific geographic hints such as `Europe`, `EMEA`, `North America`
- `isRemote` is explicit only when the source can support that claim
- `evidenceQuality` tells the matcher how much trust to place in the evidence

### Why `LocationEvidence` matters

Today the app often decides location using only a flattened display string. That is fragile.

With `LocationEvidence`:

- extractor code can preserve structured data
- the matcher can distinguish strong evidence from weak evidence
- the UI can explain why a job matched
- analytics can say which sources are losing quality due to poor evidence

## Source Capability Model

Each extractor must declare what location features it supports.

### SourceLocationCapabilities

Proposed shape:

```ts
interface SourceLocationCapabilities {
  supportsCountryQuery: boolean;
  supportsRegionGroupQuery: boolean;
  supportsCityQuery: boolean;
  requiresCityForUsefulResults: boolean;
  supportsRemoteQuery: boolean;
  supportsHybridQuery: boolean;
  supportsOnsiteQuery: boolean;
  canPostFilterCountryReliably: boolean;
  canPostFilterCityReliably: boolean;
  canPostFilterRemoteReliably: boolean;
  matchQuality: "exact" | "approximate" | "weak";
}
```

### Capability outcomes

For every requested feature, one of three statuses must result:

- native support
- post-filter support
- unsupported

This is the key product behavior for unsupported features.

### Unsupported feature policy

If an extractor does not support a feature, the system must make an explicit decision.

Rules:

- if support is native, use it and label the source `Exact` when appropriate
- if support is only reliable post-fetch, allow it with a warning and label it accordingly
- if support is unreliable both upstream and downstream, exclude the source or require explicit fallback confirmation

The app must never silently ignore the user’s filter and still run the source as if it had respected it.

### Examples of intended source profiles

These are target behaviors, not necessarily the current implementation.

#### JobSpy

- country support: mixed by site
- city support: mixed by site
- Glassdoor: city required for reliable results
- remote-only: only strong when remote-only is explicitly chosen
- quality: mixed, site-specific

#### Adzuna

- country support: native
- city support: native for strict city query
- remote support: currently limited unless better evidence is extracted
- quality: exact for country/city when evidence is present, weaker for remote

#### Hiring Cafe

- country support: native through search state
- city support: native through geocoded city radius
- remote support: depends on source mapping quality
- quality: good for geo if search state is valid, weaker when geocoding or remote evidence is incomplete

#### Working Nomads

- country support: broad token-based rather than precise geography
- city support: weak unless better evidence is preserved
- remote support: strong
- quality: remote strong, geo approximate

#### Startup.jobs

- country/city support: broad search behavior depends on upstream interpretation
- remote support: partially available
- quality: broader and less predictable

#### Golang Jobs

- upstream geo support: none
- local geo support: relatively strong because structured city/country fields exist
- quality: good for post-filtering, limited by available fields

## Source Planning Layer

The shared system must convert one `LocationIntent` into a source-specific plan for each extractor.

### SourceLocationPlan

Proposed shape:

```ts
interface SourceLocationPlan {
  mode:
    | "native_country"
    | "native_region_group"
    | "native_city"
    | "native_country_plus_city"
    | "broad_fetch_then_post_filter"
    | "unsupported";
  queryCountryKey?: string;
  queryRegionGroupKey?: string;
  queryCities?: string[];
  allowRemoteWorldwide: boolean;
  quality: "exact" | "approximate" | "weak";
  notes: string[];
}
```

### Why this layer exists

This isolates extractor quirks from the rest of the app.

Without this layer:

- every extractor invents its own interpretation of the user’s settings
- the UI cannot explain consistent behavior
- future extractors repeat the same mistakes

With this layer:

- the UI and backend use the same compatibility rules
- every extractor receives a precomputed strategy
- source quirks become adapter code instead of app-wide drift

### Examples

#### Glassdoor

If the run requests country only and no city:

- source plan should be `unsupported`
- UI should say `Needs city`
- backend should reject or exclude the source

#### Working Nomads

If the run requests remote worldwide:

- source plan may be native and strong

If the run requests Berlin:

- source plan may be `broad_fetch_then_post_filter`
- quality should be `approximate` or `weak`
- UI should expose that this source may underperform for exact city matching

#### Adzuna

If the run requests Germany plus Berlin:

- source plan should be native country plus strict city query when supported

If the run requests remote worldwide:

- source plan should only include remote support when evidence and source behavior justify it

## Matching Engine

The matching engine is the one shared location decision-maker for the pipeline.

### Responsibilities

- decide whether a job satisfies `LocationIntent`
- decide whether a match is exact or approximate
- enforce city narrowing correctly
- handle remote-worldwide logic consistently
- produce reason codes and user-facing explanations

### Proposed match result

```ts
type MatchStrength = "exact" | "approximate" | "weak" | "none";

interface LocationMatchResult {
  matched: boolean;
  strength: MatchStrength;
  reasonCode:
    | "city_exact"
    | "country_exact"
    | "region_group_exact"
    | "remote_worldwide"
    | "country_without_city"
    | "approximate_region"
    | "missing_evidence"
    | "unsupported";
  explanation: string;
  usedFallback: boolean;
}
```

### Core rules

#### Rule 1: If cities are requested, country match alone is not enough

A country match may be necessary, but it is not sufficient when the user explicitly narrowed to one or more cities.

#### Rule 2: `exact_only` must really mean exact

Only explicit supported evidence should pass.

Examples:

- matching `city === "Berlin"` is exact
- matching `countryKey === "germany"` is exact for a country-only run
- matching `Europe` for a Germany run is not exact

#### Rule 3: `flexible` can broaden only through approved evidence

Flexible matching can accept:

- known aliases
- approved region-group equivalents
- source-declared approximate geography hints

Flexible matching cannot:

- ignore a requested city
- treat unknown evidence as good enough
- silently accept global remote jobs unless the run explicitly allows them

#### Rule 4: Missing evidence is not a match

If a source gives no reliable location evidence, the system should treat that as unknown, not as a successful match.

#### Rule 5: Remote worldwide is an explicit carve-out

Jobs outside the selected geography should be kept only when:

- `remote` is included in workplace types
- search scope allows remote worldwide
- the source provides sufficiently reliable remote evidence

## Run Contract And Persistence

### Current problem

The current run flow writes settings and then starts a run that rereads settings later. That is not transactional and not deterministic.

### Target behavior

`POST /api/pipeline/run` should accept the full validated run payload.

Proposed additions:

```ts
interface RunPipelineRequest {
  topN?: number;
  minSuitabilityScore?: number;
  sources?: string[];
  searchTerms?: string[];
  locationIntent?: LocationIntent;
  runBudget?: number;
}
```

The exact API shape can follow existing request style, but the important point is that the run must carry its own location intent.

### Server behavior

On run start:

1. validate payload
2. normalize location intent
3. evaluate source capabilities
4. reject or exclude incompatible sources
5. persist a run snapshot
6. execute the pipeline using that run snapshot only

### Settings behavior

Settings can still store defaults for the next run, but:

- they are no longer the live execution source for an in-flight run
- they should not be reread for filtering decisions once the run begins

### Save defaults vs run now

These actions should be logically separate even if triggered in one UI flow.

Preferred behavior:

- validate run payload first
- if requested, save defaults after validation succeeds
- start run from the validated snapshot

This avoids half-success states where settings changed but the run never started.

## Normalization And Migration

### Legacy inputs

The system currently has to account for:

- `searchCities`
- `jobspyLocation`
- `jobspyCountryIndeed`
- old values that may contain country strings in city fields
- browser-detected defaults

### Migration goals

- preserve clear user intent
- clean invalid mixed states
- stop allowing legacy inputs to steer runtime behavior indefinitely

### Migration rules

- if a legacy city field contains a canonical country alias and broad scope is otherwise missing, migrate it to the appropriate `country` or `region_group`
- if a city list contains an item equal to the selected country, remove it from `cities`
- if the country field contains something that is clearly a city, move it into `cities` only when that migration is safe and obvious
- if a value is ambiguous, prefer conservative narrowing rather than silent broadening

### UI behavior during migration

If the app auto-cleans a legacy location configuration, it should show a lightweight note such as:

`We cleaned up an older location setting so this run uses Germany with Berlin as a city filter.`

This should be rare, not noisy.

## Extractor Output Requirements

Every extractor must provide enough structured information for downstream matching to be reliable.

### Minimum requirement

Every extractor should produce:

- current normalized job fields
- `locationEvidence`

### Strong recommendation

Whenever a source has structured fields, preserve them rather than flattening them early.

Examples:

- preserve city and country separately when available
- preserve remote flags separately from human-readable location labels
- preserve region tokens when the source exposes them

### Display vs logic split

Keep `job.location` as the display-friendly string for cards and detail pages.

Use `locationEvidence` for:

- filtering
- diagnostics
- analytics
- "why matched" explanations

## UX Copy And Presentation Rules

### The happy path must stay compact

The default user experience should surface:

- one summary sentence
- a few source chips
- only the warnings that matter

### The app should explain consequences, not architecture

Prefer:

- `This source may miss some city-specific jobs.`

Over:

- `This source falls back to local post-fetch location evidence matching.`

Prefer:

- `Remote filtering is approximate for this source.`

Over:

- `Remote inference relies on partial upstream metadata.`

### Where detail should live

Use on-demand disclosure for:

- detailed source support explanations
- backend interpretation notes
- fallback logic
- diagnostics and counts

### Job-level explanation

Each matched job can optionally show a compact reason tag.

Examples:

- `Matched city: Berlin`
- `Matched country: Germany`
- `Matched remote worldwide`
- `Approximate regional match`

This should be subtle and collapsible.

## Pre-Run Diagnostics

Before the run starts, the user should be able to see:

- what area the app will search
- which sources are exact
- which sources are broad
- which sources are blocked
- why any source is blocked

### Examples

#### Exact city run

`Searching Germany, narrowed to Berlin.`

Sources:

- JobSpy / Glassdoor: `Needs city` -> satisfied
- Adzuna: `Exact`
- Working Nomads: `Limited`
- Startup.jobs: `Broad`

#### Remote worldwide run

`Searching selected locations plus remote jobs worldwide.`

Sources:

- Working Nomads: `Exact`
- Adzuna: `Limited`
- Hiring Cafe: `Limited`

## Post-Run Diagnostics

The run result should carry clear location-related outcome data.

### Required counters per source

- fetched
- dropped by native source filtering
- dropped by local geo filtering
- dropped due to missing evidence
- kept by remote worldwide exception
- excluded before run due to unsupported feature

### Example user-facing summary

`Adzuna found 42 jobs. 18 were dropped because they matched Germany but not Berlin. 6 were kept because you allowed remote worldwide.`

### Example troubleshooting suggestions

- `Try removing city restriction.`
- `Try allowing broader matching.`
- `Try disabling sources with limited city support.`

These suggestions should be generated from real run data, not static templates alone.

## Implementation Strategy

### Phase 1: Shared model and run snapshot

Implement:

- `LocationIntent`
- `LocationEvidence`
- `SourceLocationCapabilities`
- `SourceLocationPlan`
- shared normalization utilities
- shared matcher
- run payload snapshot support

Expected outcome:

- one canonical representation of user intent
- deterministic run behavior

### Phase 2: High-risk source migration

Migrate first:

- JobSpy
- Adzuna
- Hiring Cafe
- Working Nomads

Reason:

- these sources account for most of the current location mismatch risk

Expected outcome:

- biggest reduction in empty and irrelevant runs

### Phase 3: UI redesign

Implement:

- new location builder UX
- source chips and warning states
- browser suggestion chip
- better diagnostics copy

Expected outcome:

- users understand what will happen before they run

### Phase 4: Remaining source alignment and cleanup

Finish:

- Startup.jobs
- Golang Jobs
- any remaining compatibility cleanup
- legacy field removal
- docs and analytics polish

Expected outcome:

- long-term simplification and maintainability

## Engineering Complexity

### Why this is a simplification overall

This redesign adds structure, but removes hidden coupling.

Today complexity is spread across:

- UI remaps
- settings aliases
- extractor-local interpretations
- downstream re-filtering
- legacy fallback paths

That kind of complexity is expensive because it is invisible.

The redesign simplifies the steady state by creating:

- one parser for user intent
- one matcher for location decisions
- one capability contract for sources
- one run snapshot for execution
- one place for legacy normalization

### Cost

Expected implementation difficulty:

- MVP: medium
- full polished rollout: medium-high

Estimated effort:

- high-impact first slice: 3-4 working days
- full rollout: 7-10 working days

## Observability And Logging

Add structured logging for location behavior.

Per run:

- location intent
- selected compatible sources
- excluded sources and reasons
- search scope
- strictness

Per source:

- source plan
- match quality
- counts by filtering stage
- missing evidence rate
- fallback use

This should make it easy to answer:

- why a run returned no results
- which sources are causing broad matches
- which requested cities are most fragile across sources

## Acceptance Criteria

The redesign is successful when all of the following are true.

### Product acceptance

- users can tell what geography they are searching before they click run
- users can see which sources are exact vs broad without reading technical details
- unsupported source features are visible before the run
- users get actionable explanations when runs are weak

### Behavior acceptance

- country-only runs preserve valid country matches
- city-narrowed runs do not treat country match alone as sufficient
- exact mode does not silently broaden
- flexible mode broadens only through approved logic
- remote worldwide works consistently across sources that can support it
- region-group behavior is consistent in UI, backend, and extractor adapters

### Architecture acceptance

- the pipeline uses a run snapshot instead of rereading mutable settings
- the shared matcher is the only downstream location decision-maker
- source capability rules are shared between UI and backend
- legacy location fields no longer directly steer live matching logic

### Quality acceptance

- diagnostics explain why jobs were dropped
- job-level "why matched" explanations are available
- source behavior is testable in isolation

## Test Plan

### Unit tests

- country normalization
- region-group normalization
- city cleanup and de-duplication
- intent parsing from legacy settings
- matcher behavior for exact vs flexible
- remote-worldwide carve-out behavior
- unsupported feature handling

### Source adapter tests

- Glassdoor requires city
- Adzuna country and city plan generation
- Hiring Cafe country and geocoded city planning
- Working Nomads remote and approximate geography planning
- Startup.jobs broad-mode labeling

### Pipeline tests

- run snapshot persists and is used end to end
- discovered jobs are filtered using `LocationEvidence` rather than raw strings
- missing location evidence produces predictable drops
- diagnostics counters are accurate

### UI tests

- summary sentence updates correctly
- source chips update correctly
- browser suggestion chip is visible but not silently applied
- unsupported sources are disabled or warned consistently
- detail drawer shows the correct explanation for each source

## Documentation Requirements

When the implementation lands, update:

- [docs-site/docs/features/pipeline-run.md](/Users/ssarfaraz/coding/personal/job-ops/docs-site/docs/features/pipeline-run.md)
- [docs-site/docs/features/settings.md](/Users/ssarfaraz/coding/personal/job-ops/docs-site/docs/features/settings.md) if defaults remain persistent
- relevant extractor docs for capability summaries
- troubleshooting docs with low-result explanations

The public docs should explain the final user-facing behavior, not the internal design abstractions.

## Final Design Decisions

These decisions are treated as locked for this spec.

- location must be modeled as a run-scoped domain, not loose settings strings
- `usa/ca` becomes a region-group, not a country
- city is always a narrowing concept, never a broad-scope replacement
- unsupported features must never be silently ignored
- the UX should stay compact by default and reveal complexity only when needed
- `job.location` remains display text, while `LocationEvidence` becomes decision data

## Appendix: Example UX States

### Example 1: Germany + Berlin + remote worldwide

Summary:

`Searching Germany, narrowed to Berlin, plus remote jobs worldwide.`

Chips:

- Adzuna: `Exact`
- Hiring Cafe: `Exact`
- Working Nomads: `Limited`
- Startup.jobs: `Broad`

Warning:

`2 sources may return broader location matches than Berlin.`

### Example 2: Glassdoor with no city

Summary:

`Searching Germany only.`

Chips:

- Glassdoor: `Needs city`

Warning:

`Glassdoor requires at least one city for this setup.`

Behavior:

- UI prevents enabling the source
- server rejects the source if somehow requested directly

### Example 3: Remote worldwide only

Summary:

`Searching worldwide remote roles only.`

Chips:

- Working Nomads: `Exact`
- Adzuna: `Limited`
- Hiring Cafe: `Limited`

Warning:

`Remote filtering is approximate for 2 sources.`

## Appendix: Example Job Match Reasons

- `Matched city: Berlin`
- `Matched country: Germany`
- `Matched remote worldwide`
- `Approximate regional match: Europe`
- `Excluded: missing exact city evidence`
