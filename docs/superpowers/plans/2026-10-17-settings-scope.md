# Settings Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each settings key's ownership and write policy explicit in code, preserve existing values, and verify a real old-to-new upgrade.

**Architecture:** Extend the TypeScript registry with ownership and write policy. Route reads and writes through one settings table with explicit platform, tenant, and user owner tuples. Keep hosted platform AI secrets in deployment environment variables.

**Tech Stack:** TypeScript, SQLite/Drizzle, Express, React, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-17-settings-scope-design.md`

## Global Constraints

- Keep existing hosted included-AI behavior and environment credentials.
- Preserve API response contracts, request IDs, tenant isolation, and secret masking.
- Preserve all existing settings values or report a conflict explicitly.
- Verify the old-version populated database and run all AGENTS.md CI checks under Node 22.

## Review Focus

- Two users in one hosted tenant must retain separate personal values.
- Two local private tenants must retain separate personal values.
- A platform setting must have one authoritative value after migration.
- A regular user must edit their own model/key but not platform settings.
- Missing owner and conflicting legacy rows must not silently leak across scopes.

---

### Task 1: Policy and storage

**Files:** `shared/src/settings-registry.ts`, `orchestrator/src/server/db/schema.ts`, `orchestrator/src/server/repositories/settings.ts`, new policy and repository tests.

- [ ] Write failing tests for declared scope, personal isolation, and platform uniqueness.
- [ ] Run the tests and confirm expected failures.
- [ ] Add policy metadata and explicit scoped storage, then rerun tests.

### Task 2: Legacy migration

**Files:** `orchestrator/src/server/db/migrate.ts`, migration tests.

- [ ] Write a failing upgrade test using a populated old settings table.
- [ ] Implement idempotent migration with deterministic conflict handling.
- [ ] Verify raw values and effective settings after upgrade.

### Task 3: Authorization and UI

**Files:** `orchestrator/src/server/api/routes/settings.ts`, `orchestrator/src/client/pages/SettingsPage.tsx`, relevant route and UI tests.

- [ ] Write failing tests for non-admin personal edits, platform denial, hosted policy, and mixed payloads.
- [ ] Implement server-derived permissions and narrow client save payloads.
- [ ] Verify API contract and UI behavior.

### Task 4: Real old-to-new environment and CI

**Files:** upgrade fixture/test, user-facing docs.

- [ ] Populate all registry keys on a temporary database with the old server running.
- [ ] Stop it, upgrade that same database, restart the new server, and assert representative values and runtime behavior.
- [ ] Run targeted tests and the full CI-parity commands in AGENTS.md under Node 22.
