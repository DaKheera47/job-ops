---
id: common-problems
title: Common Problems
description: Quick fixes for the most frequent setup and runtime issues.
sidebar_position: 1
---

## Docs site not loading at `/docs`

- Confirm docs build exists:

```bash
npm --workspace docs-site run build
```

- In production, ensure container includes docs build artifact.

## Deep links under `/docs/*` return 404

- Confirm Express is serving docs static mount before app SPA fallback.
- Confirm docs base URL is `/docs/` in `docs-site/docusaurus.config.ts`.

## Gmail OAuth callback fails

- Verify `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET`.
- Ensure authorized redirect URI exactly matches deployment callback URL.

## No job scoring or AI inference

- Validate `LLM_API_KEY` and provider settings.
- Check settings page and API connectivity.

## PDF generation fails

- Verify RxResume credentials.
- Confirm selected base resume exists and is accessible.

## UKVisaJobs runs fail

- Re-authenticate by removing cached auth file or forcing refresh.
- Verify extractor credentials and API response behavior.
