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

## Codex sign-in shows device-code authorization error

- Symptom: UI shows:
  - `Enable device code authorization for Codex in ChatGPT Security Settings, then run "codex login --device-auth" again`
- Fix:
  - Enable device-code authorization in ChatGPT Security Settings and retry sign-in
- Full guide:
  - [Codex Authentication](/docs/next/getting-started/codex-auth)

## Resume tailoring or scoring says the model does not exist

- Root cause: the selected provider and model do not match.
- Open **Settings -> Model** and check both the provider and the current model preview.
- If you recently switched providers, leave the model fields blank to use the provider default, or select a provider-compatible model and save again.
- For `openai`, JobOps defaults to `gpt-5.4-mini` when the model field is blank.
- For `gemini`, JobOps defaults to `google/gemini-3-flash-preview` when the model field is blank.

## PDF generation fails

- Verify RxResume credentials.
- Confirm selected base resume exists and is accessible.

## UKVisaJobs runs fail

- Re-authenticate by removing cached auth file or forcing refresh.
- Verify extractor credentials and API response behavior.
