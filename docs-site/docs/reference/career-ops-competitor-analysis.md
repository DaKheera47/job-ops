---
id: career-ops-competitor-analysis
title: Feature Analysis — job-ops vs career-ops
description: Side-by-side comparison of job-ops and santifer/career-ops, covering what each product can and can't do, and where job-ops can improve.
sidebar_position: 99
---

# Feature Analysis: job-ops vs career-ops

> **Source**: [santifer/career-ops](https://github.com/santifer/career-ops) analysed on 2026-05-23.  
> Author's claim: evaluated 740+ offers, generated 100+ tailored CVs, landed a Head of Applied AI role.

---

## TL;DR

| Dimension | job-ops | career-ops |
|---|---|---|
| **Interface** | Web app (React dashboard) | CLI / AI coding agent |
| **Job discovery** | 14 extractors + manual import | Portal scanner (45+ companies + board queries) |
| **Scoring** | 0–100 AI suitability score | A–F with 10 weighted dimensions, 6-block deep eval |
| **Resume tailoring** | Per-job AI rewrite, smart project selection | Per-job AI rewrite via Playwright/HTML → ATS PDF |
| **Post-application tracking** | Gmail OAuth smart inbox, auto stage detection | Markdown TSV tracker, manual stage updates |
| **Interview prep** | Ghostwriter chat per job | STAR+R story bank that accumulates across evals |
| **Negotiation support** | ✗ | Full scripts (geo discount, competing offer) |
| **Visa sponsor search** | ✓ (UK register) | ✗ |
| **Company watchlist** | ✓ (Workday / BambooHR) | Via portal scanner |
| **Analytics** | Conversion funnel, response rate by source | ✗ |
| **Data storage** | SQLite (structured, queryable) | Markdown + YAML + TSV |
| **Multi-tenancy** | Full workspace isolation | Single-user, local only |
| **Setup friction** | Docker Compose, self-hosted | Clone + `npm install` + Claude Code |

---

## Architecture Difference

This is the most fundamental split between the two products.

**job-ops** is a **persistent web application**: Express + SQLite backend, React SPA frontend, Docker-deployable, multi-workspace. It is always running and you interact with it through a browser.

**career-ops** is an **agentic CLI tool**: It has no server. You open Claude Code (or Gemini CLI / OpenCode) inside the project directory and invoke slash commands. State is files on disk. The only "UI" beyond the CLI is a Go/Bubble Tea terminal dashboard built separately.

This difference shapes everything else below.

---

## Detailed Feature Comparison

### 1. Job Discovery

| Capability | job-ops | career-ops |
|---|---|---|
| LinkedIn / Indeed / Glassdoor | ✓ (via JobSpy) | ✗ |
| Specialist boards (Adzuna, HiringCafe, startup.jobs, Working Nomads, Gradcracker, UKVisaJobs, GolangJobs, Seek, Wuzzuf, Naukri, JobIndex, FiveAmSat) | ✓ (14 extractors) | ✗ |
| Scan specific company career pages | ✗ | ✓ (Playwright, 45+ pre-configured: Anthropic, OpenAI, ElevenLabs, Retool, n8n, …) |
| ATS board queries (Ashby, Greenhouse, Lever, Wellfound, Workable) | ✗ | ✓ (19 pre-built queries) |
| Expired posting verification | ✗ | ✓ (`--verify` flag runs Playwright liveness check) |
| Manual URL import | ✓ | ✓ (paste URL → full pipeline) |
| Duplicate detection | ✓ (fuzzy, 30-day window) | ✓ (dedup during pipeline merge) |
| Batch pipeline execution | ✓ (concurrency-pooled steps) | ✓ (parallel `claude -p` workers) |

**Gap in job-ops**: No targeted company-portal scanning. You can't say "show me new roles at Anthropic's Greenhouse page since yesterday." career-ops' scanner with 45+ pre-configured companies is a major discovery advantage for targeted searches.

**Gap in career-ops**: No coverage of aggregator boards (LinkedIn, Adzuna, Indeed). High-volume discovery of roles you didn't know existed requires job-ops' extractor network.

---

### 2. Job Evaluation & Scoring

| Capability | job-ops | career-ops |
|---|---|---|
| AI suitability score | ✓ (0–100, cached, regeneratable) | ✓ (A–F, 10 weighted dimensions) |
| Score breakdown / reasoning | ✗ (score only) | ✓ (6-block evaluation: role summary, CV match, level strategy, comp research, personalisation, interview prep) |
| Archetype detection | ✗ | ✓ (LLMOps / Agentic / PM / SA / FDE / Transformation — adjusts weights per archetype) |
| Compensation research | ✗ | ✓ (comp benchmarking built into evaluation block) |
| Level strategy guidance | ✗ | ✓ (career trajectory advice per role) |
| Auto-skip below threshold | ✓ | Implicit (score gate before PDF) |
| Visa sponsor matching | ✓ (UK official register) | ✗ |
| Job brief generation | ✓ (AI-structured summary) | ✓ (part of evaluation block) |

**Gap in job-ops**: The 0–100 score is opaque. There is no breakdown of *why* a job scored 74 — what matched, what's a gap, what the level strategy should be. career-ops' 6-block structured evaluation gives actionable intelligence per role, not just a number. This is the most impactful single feature difference for decision quality.

---

### 3. Resume / CV

| Capability | job-ops | career-ops |
|---|---|---|
| Per-job AI summary rewrite | ✓ | ✓ |
| Smart project selection from pool | ✓ (AI selects from "AI-selectable" pool) | ✓ (inferred from CV + JD) |
| Resume Studio (local-first editor) | ✓ (Reactive Resume v5 compatible) | ✗ (cv.md markdown file) |
| PDF generation renderer | ✓ (Typst local + rxresume backend) | ✓ (Playwright + HTML template with Space Grotesk / DM Sans) |
| ATS keyword injection | ✗ (implicit via tailoring) | ✓ (explicit keyword injection in PDF mode) |
| Canva resume support | ✗ | ✓ (Canva design ID in profile) |
| Skills validation (PDF → text extract) | ✓ | ✗ |
| Tracer Links (click analytics on resume links) | ✓ | ✗ |
| Stale PDF auto-queue regeneration | ✓ | ✗ (regenerate on demand) |
| Export | ✓ (Reactive Resume v5 JSON) | ✓ (HTML + PDF output dir) |

**Gap in job-ops**: No explicit ATS keyword injection. job-ops rewrites prose to reflect the JD, but career-ops injects specific keywords scraped from the JD into the PDF for ATS parsers, which is a different and complementary technique.

---

### 4. Interview Preparation

| Capability | job-ops | career-ops |
|---|---|---|
| Per-job Ghostwriter chat | ✓ (context = JD + profile + selected notes, up to 8 notes / 12K chars) | Partial (evaluation block includes STAR stories per evaluation) |
| Interview story bank (STAR+R) | ✗ | ✓ (5–10 master stories that grow across evaluations, answering any behavioural question) |
| Role-specific answer drafting | ✓ (Ghostwriter) | ✓ (evaluation block) |
| Salary negotiation scripts | ✗ | ✓ (geographic discount pushback, competing offer leverage, frameworks) |
| LinkedIn outreach messages | ✗ | ✓ (`/career-ops contacto`) |
| Deep company research | ✗ | ✓ (`/career-ops deep`) |
| Cover letter generation | ✓ (via Ghostwriter) | ✓ (via evaluation / pdf mode) |

**Gap in job-ops**: No persistent cross-job interview story bank. Every Ghostwriter session starts fresh. career-ops accumulates STAR+Reflection stories over every evaluation, building a reusable library of proof points. This compounds in value the more roles you evaluate — a structural advantage for interview readiness.

**Gap in job-ops**: No negotiation support at all. Salary negotiation scripts are high-value and completely absent.

---

### 5. Application Tracking

| Capability | job-ops | career-ops |
|---|---|---|
| Job lifecycle states | ✓ (discovered → processing → ready → applied + skipped/expired) | ✓ (pending / applied / interviewing / offer / rejected + custom statuses) |
| In-progress kanban board | ✓ | ✗ |
| Gmail OAuth smart inbox | ✓ (auto-link 95–100% confidence, queue 50–94%, ignore <50%) | ✗ |
| Auto stage detection from email | ✓ (recruiter screen → assessment → technical → onsite → offer → rejected) | ✗ |
| Manual stage updates | ✓ | ✓ (terminal dashboard or flat file) |
| Pipeline integrity checks | ✗ | ✓ (dedup, status normalisation, health check on merge) |
| Analytics: conversion funnel | ✓ (Applied → Screen → Interview → Offer → Rejected) | ✗ |
| Analytics: response rate by source | ✓ | ✗ |
| Configurable time windows | ✓ (7d / 14d / 30d / 90d) | ✗ |

**Gap in career-ops**: No email integration. All stage updates are manual or inferred by the AI during evaluation — nothing captures what actually happens post-apply automatically.

---

### 6. Configuration & Personalisation

| Capability | job-ops | career-ops |
|---|---|---|
| LLM provider flexibility | ✓ (OpenRouter, OpenAI, GLM, LM Studio, Ollama, Gemini, Gemini CLI, Codex, any OpenAI-compatible) | ✓ (Claude Code, Gemini CLI, OpenCode, Codex) |
| Purpose-specific model overrides | ✓ (scoring / tailoring / project selection can use different models) | ✗ (single model per CLI session) |
| Writing style config | ✓ (tone, formality, output language, constraints, do-not-use terms, Stop Slop) | Partial (in profile YAML narrative fields) |
| Editable system prompts | ✓ | ✓ (modes/*.md are fully editable; Claude edits them on request) |
| Archetype / role targets | ✗ | ✓ (profile.yml archetypes with fit levels: primary / secondary / adjacent) |
| Compensation targets | ✗ | ✓ (target range, minimum / walk-away, currency, geo flexibility) |
| Visa status / geo preferences | ✓ (via search filters) | ✓ (in profile YAML) |
| Proof points / article digest | ✗ | ✓ (profile YAML + article-digest.md informs evaluations) |
| Webhook integration (n8n etc.) | ✓ | ✗ |

**Gap in job-ops**: No structured candidate profile with archetypes, compensation targets, and proof points. The AI scoring knows the job but learns relatively little about the specific candidate beyond what's in the resume. career-ops' `profile.yml` + `article-digest.md` gives the AI rich personal context that directly improves scoring quality and cover letter personalisation.

---

### 7. Accessibility & UX

| Capability | job-ops | career-ops |
|---|---|---|
| Web UI | ✓ (React, Tailwind, Radix) | ✗ |
| Terminal dashboard | ✗ | ✓ (Go + Bubble Tea, 6 filter tabs, 4 sort modes, lazy-loaded previews) |
| Mobile access | ✓ (browser) | ✗ |
| Keyboard shortcuts | ✓ (Cmd+K fuzzy search, navigation) | CLI-native |
| Multi-user / multi-workspace | ✓ (full workspace isolation) | ✗ (single-user, local only) |
| Localisation | ✗ | ✓ (README in 9 languages; modes can be run in any language) |
| Setup complexity | Medium (Docker Compose) | Low (`npm install` + API key) |
| Data format | Structured SQL (SQLite) | Human-readable (Markdown + YAML + TSV) |

---

### 8. Unique job-ops Features (not in career-ops)

1. **Visa sponsor register** — searches official UK sponsor database; badges in job list with route/type details.
2. **Watchlist** — monitors specific company career boards (Workday, BambooHR ATS adapters) for new postings with "new since last check" badges.
3. **Tracer Links** — privacy-safe resume link analytics (click events, destination, bot flagging). Know if a recruiter opened your CV.
4. **Gmail smart inbox** — automatically finds, categorises, and links recruiter emails to jobs. Detects interview stage transitions without manual work.
5. **Analytics dashboard** — conversion funnel, response rate by source, configurable time windows. Lets you see which boards actually respond.
6. **Resume Studio** — local-first live editor compatible with Reactive Resume v5. Edit resume in the same app without switching tools.
7. **Stop Slop mode** — strips passive voice and filler phrases from Ghostwriter output.
8. **Multi-workspace** — full tenant isolation, useful for managing separate searches (e.g., UK vs remote, senior vs staff).
9. **Pipeline webhooks** — emit events to n8n / other automation tools for scheduling, notifications, or downstream workflows.
10. **PDF stale tracking** — automatically queues PDF regeneration when resume changes, keeps old PDF available in the meantime.

---

### 9. Unique career-ops Features (not in job-ops)

1. **6-block structured evaluation** — per-role report covering role summary, CV match, level strategy, comp research, personalisation, and interview prep. Qualitative depth that job-ops' scalar score doesn't provide.
2. **Interview story bank** — STAR+Reflection stories accumulate across all evaluations, building a reusable behavioural interview library.
3. **Negotiation scripts** — salary pushback frameworks, geographic discount counters, competing offer leverage scripts.
4. **Company portal scanner** — 45+ AI/tech companies pre-configured with Playwright-based scraping. Scans Greenhouse, Ashby, Lever, Wellfound, Workable directly.
5. **Expired posting verification** — `--verify` flag checks liveness of discovered postings before they enter the pipeline.
6. **Archetype-aware scoring** — classifies roles into LLMOps / Agentic / PM / SA / FDE / Transformation and adjusts scoring weights accordingly.
7. **Compensation intelligence** — market rate benchmarking and level-strategy advice built into every evaluation.
8. **LinkedIn outreach generation** — `/career-ops contacto` writes personalised outreach messages.
9. **Deep company research** — `/career-ops deep` mode for full company intelligence.
10. **Form auto-fill** — `/career-ops apply` fills application forms with AI.
11. **Portfolio project evaluation** — `/career-ops project` evaluates whether a side project is worth including / how to present it.
12. **Course/cert evaluation** — `/career-ops training` advises on whether a certification is worth pursuing for target roles.
13. **Candidate profile YAML** — structured `profile.yml` with archetypes, compensation targets, proof points, and narrative. Gives the AI rich, persistent personal context.
14. **Agentic CLI integration** — natively supports Claude Code, Gemini CLI, OpenCode. Modes are markdown files that any AI CLI can read and execute.
15. **Human-readable state** — all data in version-controllable markdown/YAML/TSV, inspectable without any app.

---

## Where job-ops Can Improve

Prioritised by estimated user impact:

### Priority 1 — High impact, moderate effort

#### 1.1 Score breakdown / evaluation report
The 0–100 score is a black box. Add a structured per-job evaluation report (markdown or collapsible UI panel) that explains the score across dimensions: skills match, seniority fit, location/remote match, compensation fit, company type fit. Users need *why*, not just *what*. career-ops proves this is the difference between a tool that informs decisions vs one that just filters noise.

#### 1.2 Candidate profile with archetypes and proof points
Add a structured profile section (beyond the resume) where users define:
- Target role archetypes with fit levels (primary / secondary / adjacent)
- Compensation targets and walk-away number
- Proof points / hero metrics to reference in tailoring
- Career narrative / exit story

This personal context makes scoring and tailoring outputs significantly better quality, and is the basis for negotiation scripts and outreach messages.

#### 1.3 Interview story bank (STAR+R)
The Ghostwriter currently starts with zero memory of previous conversations. Add a persistent story bank that accumulates STAR+Reflection evidence from each role evaluation and Ghostwriter session. Stories are tagged by competency (leadership, delivery, technical, stakeholder, etc.) and surfaced when relevant. This compounds in value: by application 50 you have a comprehensive behavioural interview library.

### Priority 2 — High impact, higher effort

#### 2.1 Company portal scanner
Allow users to add specific companies to a watchlist that goes beyond BambooHR/Workday to Greenhouse, Ashby, Lever, and Wellfound. career-ops' scanner with 45+ pre-configured AI/tech companies solves targeted company monitoring that no general-purpose job board can. job-ops' Watchlist covers only two ATS platforms; adding Greenhouse and Lever (which is where most funded startups and tech companies post) would significantly expand coverage.

#### 2.2 Negotiation support
Add a negotiation mode to Ghostwriter or as a standalone feature:
- Salary range research for the role (can use the same LLM call as scoring)
- Geographic discount pushback scripts
- Counter-offer framing based on the offer details and compensation profile
This is a genuinely high-value use case that is absent entirely.

#### 2.3 Level/career strategy per role
The pipeline identifies *suitability* but not *strategy*. For each job, surface:
- Am I overqualified / underqualified and by how much?
- Is this a step up, lateral, or step back — and is that intentional?
- What would I need to demonstrate to get the offer?

This reframes job search as career planning, not just application queuing.

### Priority 3 — Medium impact, lower effort

#### 3.1 Archetype / role classification
Tag jobs with a detected role archetype (e.g., Individual Contributor / Manager, Hands-on / Strategic, Domain: AI/ML / Platform / Product / Data). This allows filtering by archetype and lets the scoring system apply different weights — a PM role and a Staff Engineer role should not score against the same dimensions.

#### 3.2 Compensation field and display
Capture and display a compensation target in Settings. Surface salary alignment as part of the score breakdown (or as a badge on the job card: "Below target", "On target", "Above target"). Currently jobs with a salary listed have no mechanism to flag misalignment.

#### 3.3 LinkedIn outreach generation
Add a Ghostwriter mode that generates a personalised LinkedIn connection request or cold message to a recruiter/hiring manager at a company, informed by the job description, the candidate profile, and any company context.

#### 3.4 Expired posting check
When a job is discovered or moved to "ready", add an optional liveness check (fetch the original URL, detect common "job no longer available" patterns) to avoid wasting tailoring budget on closed roles.

#### 3.5 Portfolio / project evaluation
Add a Ghostwriter prompt mode that evaluates whether a personal project should be included in the resume tailoring for a specific role, and how to frame it for maximum relevance.

---

## Summary Table

| Feature area | job-ops | career-ops | Winner |
|---|---|---|---|
| High-volume job discovery | ✓ ✓ (14 extractors) | ✗ | **job-ops** |
| Targeted company monitoring | Partial (2 ATS) | ✓ ✓ (45+ portals, Playwright) | **career-ops** |
| Scoring depth | Scalar (0–100) | 6-block + archetype-weighted | **career-ops** |
| Resume tailoring | ✓ ✓ (Studio + smart projects) | ✓ (ATS keyword injection) | **Tie** |
| Interview prep | Ghostwriter (per-session) | STAR bank (cumulative) | **career-ops** |
| Negotiation | ✗ | ✓ ✓ | **career-ops** |
| Post-apply tracking | ✓ ✓ (Gmail AI + funnel analytics) | Manual only | **job-ops** |
| Visa sponsor matching | ✓ (UK) | ✗ | **job-ops** |
| Resume link analytics | ✓ (Tracer Links) | ✗ | **job-ops** |
| Analytics / reporting | ✓ ✓ (funnel, source ROI) | ✗ | **job-ops** |
| Candidate profile richness | Low (resume only) | ✓ ✓ (profile.yml + narrative) | **career-ops** |
| Setup complexity | Medium | Low | **career-ops** |
| Multi-user / workspace | ✓ ✓ | ✗ | **job-ops** |
| Data portability | SQLite (exportable) | Plain files (git-friendly) | **career-ops** |
| Comp / salary intelligence | ✗ | ✓ | **career-ops** |

---

*Analysis generated 2026-05-23. career-ops version: main branch at commit 19a1820.*
