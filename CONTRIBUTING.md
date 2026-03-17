# Contributing to JobOps

Thanks for helping improve JobOps.

This guide is intentionally short and GitHub-friendly. It focuses on contributor workflow and links to the existing docs for setup, style, and troubleshooting so we do not duplicate documentation.

## What You Can Contribute

- Bug fixes and reliability improvements
- UI/UX improvements
- Extractors and integrations
- Documentation updates
- Tests and developer experience improvements

## Before You Start (Pick a Path)

Use the path that matches your change:

| Path | Main folders | Start command(s) | Canonical docs |
| --- | --- | --- | --- |
| Docs/content | `docs-site/docs` | `npm run docs:dev` | [Docs style guide](https://jobops.dakheera47.com/docs/next/reference/documentation-style-guide), [FAQ](https://jobops.dakheera47.com/docs/next/reference/faq) |
| App/UI/API | `orchestrator`, `shared` | `npm --workspace orchestrator run dev` | [Self-hosting](https://jobops.dakheera47.com/docs/getting-started/self-hosting), [Troubleshooting](https://jobops.dakheera47.com/docs/next/troubleshooting/common-problems) |
| Extractors | `extractors/*`, sometimes `shared` | Relevant type checks + tests | [Add an extractor](https://jobops.dakheera47.com/docs/next/workflows/add-an-extractor), [Extractors overview](https://jobops.dakheera47.com/docs/extractors/overview) |

## Local Setup (Minimal)

For full end-user setup, environment variables, OAuth, and deployment details, use the [Self-Hosting Guide](https://jobops.dakheera47.com/docs/getting-started/self-hosting) and [Gmail OAuth Setup](https://jobops.dakheera47.com/docs/getting-started/gmail-oauth-setup).

Contributor baseline from repo root:

```bash
npm ci
npm --workspace orchestrator run db:migrate
npm --workspace orchestrator run dev
```

If you are editing docs:

```bash
npm run docs:dev
```

Local URLs:

- Orchestrator UI: `http://localhost:5173`
- Orchestrator API: `http://localhost:3001`
- Docs site: `http://localhost:3006`

## How to Make a Change

1. Create a branch from `origin/main`.
2. Keep the PR focused on one change or one problem.
3. If the change is user-visible, update docs (or link the relevant docs update in the same PR).
4. Include screenshots or short clips for UI changes when helpful.
5. Mention any tradeoffs or follow-up work in the PR description.

## Releases

Releases are driven from GitHub Actions.

1. Open the `release` workflow in GitHub Actions.
2. Enter the next version as `x.y.z` (for example `0.1.30`).
3. Optionally enter a separate release title for GitHub (for example `Google Dorks!`).
4. Run the workflow.

The workflow will:

- bump `orchestrator/package.json`
- update `package-lock.json`
- commit the version bump to `main`
- create and push tag `vX.Y.Z`
- publish the `ghcr.io/.../job-ops` image for that release
- create the GitHub release using either the custom title or `vX.Y.Z`

The app version shown in the UI is sourced from `orchestrator/package.json`, so the release version, tag, and displayed app version stay aligned even when the GitHub release title is customized separately.

## Validation Before PR (CI-Parity Checks)

Run from the repository root:

```bash
./orchestrator/node_modules/.bin/biome ci .
npm run check:types:shared
npm --workspace orchestrator run check:types
npm --workspace gradcracker-extractor run check:types
npm --workspace ukvisajobs-extractor run check:types
npm --workspace orchestrator run build:client
npm --workspace orchestrator run test:run
```

If tests fail due to a `better-sqlite3` Node ABI mismatch, rebuild it and rerun tests:

```bash
npm --workspace orchestrator rebuild better-sqlite3
```

CI runs on Node 22. If local behavior differs, verify with Node 22 before concluding a change is valid.

## Project-Specific Standards (Link-First)

Before editing server routes/services, read [`AGENTS.md`](./AGENTS.md) for repository standards, especially:

- `/api/*` response contract and status/code mapping
- Correlation/request IDs (`x-request-id`) and logging context
- Shared logger usage in core server paths (no direct `console.*`)
- SSE helper usage
- Redaction/sanitization defaults for logs and error details
- Minimal webhook and LLM payload defaults

## Where to Find Deeper Docs

- [Documentation Home](https://jobops.dakheera47.com/docs/)
- [Self-Hosting Guide](https://jobops.dakheera47.com/docs/getting-started/self-hosting)
- [Gmail OAuth Setup](https://jobops.dakheera47.com/docs/getting-started/gmail-oauth-setup)
- [Documentation Style Guide](https://jobops.dakheera47.com/docs/next/reference/documentation-style-guide)
- [FAQ (includes where to edit docs)](https://jobops.dakheera47.com/docs/next/reference/faq)
- [Add an Extractor Workflow](https://jobops.dakheera47.com/docs/next/workflows/add-an-extractor)
- [Troubleshooting](https://jobops.dakheera47.com/docs/next/troubleshooting/common-problems)
