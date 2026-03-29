---
id: ghostwriter
title: Ghostwriter
description: Context-aware per-job AI chat assistant behavior and API surface.
sidebar_position: 2
---

## What it is

Ghostwriter is the per-job AI chat assistant in JobOps.

Ghostwriter uses:

- current job description and metadata
- reduced profile snapshot
- global writing style settings
- the configurable Ghostwriter system prompt template from Settings

The UI behavior is one persistent conversation per job, shown in the right-side drawer from job details.

## Why it exists

Ghostwriter helps you produce job-specific writing quickly while preserving consistency with your profile and style settings.

Typical use cases:

- role-specific answer drafting
- cover letter and outreach drafts
- interview prep tied to the job description
- rephrasing with tone constraints
- multilingual drafting when you want replies in a specific language

## How to use it

1. Open a job in `discovered` or `ready`.
2. Open the Ghostwriter drawer.
3. Enter your prompt and stream a response.
4. Use the `Copy` button on any completed Ghostwriter reply to copy the full output.
5. Stop or regenerate responses when needed.

### Writing style settings impact

Global settings affecting generations:

- `Tone`
- `Formality`
- `Constraints`
- `Do-not-use terms`

Ghostwriter follows the output language you request in your prompt. For example, `Ecris en français` should produce a French reply.

If you want a persistent default language, set it in **Settings → Writing Style & Language**.

If you need to change Ghostwriter's base behavior more deeply, edit the
Ghostwriter prompt template in **Settings → Prompt Templates**. That editor is
advanced on purpose: removing instructions or placeholders can make responses
less reliable, but reset restores the default template quickly.

`Do-not-use terms` are passed as guidance in the prompt. They are not enforced by a hard post-generation filter, so the model should avoid them but may still use them occasionally.

Defaults:

- Tone: `professional`
- Formality: `medium`
- Constraints: empty
- Do-not-use terms: empty

### Context and safety model

- Job snapshot is truncated to fit prompt budget.
- Profile snapshot includes relevant slices only.
- System prompt enforces read-only assistant behavior.
- Logging stores metadata, not full prompt/response dumps.

### API surface

- `GET /api/jobs/:id/chat/messages`
- `POST /api/jobs/:id/chat/messages` (streaming)
- `POST /api/jobs/:id/chat/runs/:runId/cancel`
- `POST /api/jobs/:id/chat/messages/:assistantMessageId/regenerate` (streaming)

Compatibility thread endpoints remain, but UI behavior is one thread per job.

## Common problems

### Responses feel too generic

- Verify the job description is complete and current.
- Confirm style constraints in Settings are specific enough.
- If you customized the Ghostwriter prompt template, compare it with the default
  or reset it to confirm the regression comes from the template.

### Generation quality is lower than expected

- Check model/provider configuration in Settings.
- Tighten prompts with explicit output intent (for example, "3 bullet points for recruiter outreach").
- If you need a non-English response every time, set it in **Settings → Writing Style & Language**.

### Missing context in answers

- Update profile data and relevant project details used by Ghostwriter context.
- Regenerate after updating job notes/description.

### I need to reuse a reply outside JobOps

- Use the `Copy` button shown on each completed Ghostwriter response.
- If the button changes to `Copied`, the full reply is already on your clipboard.

## Related pages

- [Settings](/docs/next/features/settings)
- [Reactive Resume](/docs/next/features/reactive-resume)
- [Orchestrator](/docs/next/features/orchestrator)
