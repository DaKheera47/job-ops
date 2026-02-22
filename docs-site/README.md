# JobOps Docs Site

Docusaurus workspace for user-facing documentation.

## Development

From repository root:

```bash
npm run docs:dev
```

Local docs server runs on `http://localhost:3006`.

## Build

```bash
npm run docs:build
```

Build output:

- `docs-site/build`

## Configuration

Set these environment variables for deploys:

- `DOCS_SITE_URL`: Public origin for canonical/sitemap URLs.
  Example: `https://jobops.dakheera47.com`
- `DOCS_BASE_URL`: Route prefix where docs are hosted.
  Example: `/docs/`

Defaults:

- `DOCS_SITE_URL=http://localhost:3006` for local development (`npm run docs:dev`)
- `DOCS_SITE_URL=https://jobops.dakheera47.com` for production builds when unset
- `DOCS_BASE_URL=/docs/`

## Versioning

Cut a docs version tied to a release tag:

```bash
npm run docs:version -- 1.0.0
```
