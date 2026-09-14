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

## Older jobs look expired or stale

- Run the pipeline again before reviewing or applying.
- Existing discovered jobs are not automatically refreshed in the background.
- A new run fetches current listings so you can work from fresher results.

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
- For `codex`, JobOps defaults to `gpt-5.4-mini` when the model field is blank.
- For `glm`, JobOps defaults to `glm-5.1` and `https://api.z.ai/api/paas/v4` when the model/base URL fields are blank.
- For `gemini`, JobOps defaults to `google/gemini-3-flash-preview` when the model field is blank.

## PDF generation fails

- Verify RxResume credentials.
- Confirm selected base resume exists and is accessible.

## UKVisaJobs runs fail

- Re-authenticate by removing cached auth file or forcing refresh.
- Verify extractor credentials and API response behavior.

## Ghostwriter returns empty response / validation error when using Gemini models

- **Symptom**: Chat responses from Ghostwriter are empty, or show a validation/structure error.
- **Root cause**: Standard Gemini REST API expects `responseMimeType` and `responseSchema` at the top level of `generationConfig`. The app was passing them wrapped in a nested `responseFormat` structure, causing Gemini to silently ignore the schema constraints and return responses with an unexpected shape (e.g. `{ "coverLetter": "..." }` instead of `{ "response": "..." }`).
- **Fix**: The Gemini integration was updated to correctly pass structured schema parameters. A runtime validation was added to surface formatting issues immediately as an error rather than failing silently with an empty message. If you still encounter issues, verify you are using a model that fully supports JSON schema structured outputs.
