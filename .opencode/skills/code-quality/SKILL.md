---
name: orchestrator-code-quality
description: Generate a code quality report for the orchestrator/ folder focusing on duplication, complexity hotspots, and error/logging consistency, using npm run check:all as the primary gate; report only (no code changes).
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  repo_area: orchestrator
  primary_command: npm run check:all
---

## What I do

- Operate strictly within the `orchestrator/` folder.
- Produce a Markdown report describing:
  1. **Duplication / near-duplication**
  2. **Over-complex functions / “god modules”**
  3. **Inconsistent error handling and logging**
- Use `npm run check:all` as the authoritative signal for tests + linting.
- Do **not** change code, configuration, scripts, or dependencies. This skill outputs a report only.

## When to use me

Use this when you want an evidence-driven code quality assessment and a prioritized plan for remediation **without implementing changes yet**.

## Constraints

- Work only in `orchestrator/`. Do not analyze or reference other folders except when required to understand imports into `orchestrator/`.
- Do not propose changes to tooling. Assume `npm run check:all` is the existing gate.
- Do not perform refactors. Do not open PRs. Do not rewrite files. Report findings and recommended fixes only.

## Inputs I expect

- Repository access with an `orchestrator/` directory.
- Ability to run `npm run check:all` from within `orchestrator/`.
- (Optional but recommended) Output logs from `npm run check:all` if the environment cannot run commands.

## Process

1. **Set working area**
   - Ensure all investigation is scoped to `orchestrator/`.

2. **Execute quality gate**
   - Run `npm run check:all` in `orchestrator/`.
   - Capture:
     - lint errors/warnings (rule IDs, counts, file paths)
     - failing tests (test names, stack traces, determinism vs flakiness indicators)
     - coverage output (if produced by the command)

3. **Assess duplication**
   - Identify copy/paste and near-duplicate logic patterns in `orchestrator/`:
     - repeated parsing/validation
     - repeated error mapping and response shaping
     - repeated API call wrappers / fetch patterns
     - repeated UI hooks/components with minor differences (if applicable)
   - Prefer evidence:
     - “same structure appears in files A/B/C”
     - “multiple implementations differ only by X/Y flags”
   - If the repo already includes duplication tooling, use it; otherwise rely on code inspection and minimal search.

4. **Assess complexity hotspots**
   - Identify functions/modules with:
     - deep nesting
     - long functions
     - mixed responsibilities (validation + IO + transformation + logging)
     - difficult-to-test implicit dependencies
   - Provide concrete hotspots (file paths, function names) and why they’re hotspots.

5. **Assess error handling and logging consistency**
   - Check for:
     - multiple error shapes (different status codes/messages for same category)
     - swallowed errors vs raw throws
     - missing context/correlation fields in logs
     - potentially sensitive data in logs
   - Identify boundary points (handlers, adapters) where standardization should occur.

6. **Synthesize a fix plan**
   - Provide a prioritized plan with blast radius assessment and test needs.
   - Do not implement. Do not request changes. Report recommended actions only.

## Report output format

Create a single Markdown report containing these sections:

### 1. Scope and constraints

- Confirm `orchestrator/` scope and reliance on `npm run check:all`.

### 2. Evidence summary

- `npm run check:all` outcome:
  - Lint: top rule IDs + counts + representative file paths
  - Tests: failing tests list + deterministic vs flaky notes
  - Coverage: summary if present

### 3. What’s wrong and why it matters

Include these subsections (at minimum):

#### 3.1 Duplication and near-duplication

- Symptoms observed (with file-level examples)
- Why it matters in this repo
- What should be done to fix it (safe refactor tactics + tests needed)

#### 3.2 Over-complex functions and “god modules”

- Hotspots (file paths + functions)
- Risk explanation (bug surface, change friction)
- What should be done (decomposition targets + boundaries + tests)

#### 3.3 Inconsistent error handling and logging

- Inconsistencies found (examples)
- Operational/security impact
- What should be done (standard error types/mapping + logging conventions)

### 4. Fix strategy (prioritized)

- Phase 1 — Reduce duplication safely
- Phase 2 — Decrease complexity in hotspots
- Phase 3 — Standardize error handling and logging

Each phase must include:

- Ordered list of actions
- Expected blast radius (low/medium/high)
- Required test additions (if any)
- Validation steps (how to confirm improvement via `npm run check:all`)

### 5. Definition of done

- `npm run check:all` passes reliably
- Measurable reduction in targeted duplication clusters
- Complexity hotspots reduced or isolated behind clear boundaries
- Error/logging behavior consistent at boundaries
- No coverage regressions (if coverage is tracked)

## Quality bar for recommendations

- Be specific: include file paths, function names, rule IDs, and observed patterns.
- Be conservative: prefer small, behavior-preserving refactors in the plan.
- Avoid “make it green” shortcuts:
  - do not recommend disabling lint rules/tests as a first move
  - if quarantining a flaky test is suggested, include a concrete follow-up requirement and deadline policy
