# JobOps / Gipfeli Platform Foundation

Execution worktree for evolving JobOps into the Gipfeli SaaS platform shell while keeping Resume Studio and canonical resume ownership explicit.

## Stack

- TypeScript monorepo with npm workspaces (`package.json`)
- Orchestrator: React 18, Vite, Express, Drizzle ORM, better-sqlite3, Zod (`orchestrator/package.json`)
- Shared package: TypeScript + Zod (`shared/package.json`)

## Commands

- Dev: `npm --workspace orchestrator run dev`
- Build: `npm --workspace orchestrator run build:client`
- Test: `npm run test:all`
- Lint: `./orchestrator/node_modules/.bin/biome ci .`
- Typecheck: `npm run check:types`

## Architecture

- Product shell and server live in `orchestrator/src`.
- Shared cross-package contracts live in `shared/src`.
- Supporting docs live in `docs-site`, and extractors live under `extractors/*`.

## Rules

- Keep `/api/*` responses in `{ ok, data/error, meta.requestId }` form.
- Use shared logger wrappers in core server paths; do not add raw `console.*`.
- Preserve explicit canonical-vs-derived resume ownership boundaries.

## Do Not Touch

- Do not use the dirty source checkout outside this worktree for implementation.
