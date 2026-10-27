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
- selected job notes when you choose them in the composer
- global writing style settings
- the configurable Ghostwriter system prompt template from Settings

The UI behavior is one persistent conversation per job, shown in the right-side drawer from job details, with an optional desktop pop-up mode for focused writing.

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
3. On desktop, use the header expand button to open pop-up mode and the restore button to return to drawer mode.
4. Use the `Notes` selector near the composer to choose job notes Ghostwriter should include as extra context.
5. Enter your prompt and stream a response.
6. Use the `Copy` button on any completed Ghostwriter reply to copy the full output.
7. Stop or regenerate responses when needed.

### Note context

The note selector uses existing job notes only. Save email details, interview transcripts, recruiter names, or preparation notes as job notes first, then select them in Ghostwriter.

Selected notes are remembered for the job's Ghostwriter conversation. New prompts, edits, and regenerations use the current selection.

Limits:

- Up to 8 selected notes.
- Each note contributes up to 3,000 characters.
- Selected notes contribute up to 12,000 characters total.

The UI shows an `8 note limit` footer when you reach the selection cap. Oversized selected notes show `Trimmed for AI`, and the selector warns when the total selected note content exceeds the context budget.

### Writing style settings impact

Global settings affecting generations:

- `Tone`
- `Formality`
- `Constraints`
- `Do-not-use terms`
- `Use Stop Slop for Ghostwriter`

Ghostwriter follows the output language you request in your prompt. For example, `Ecris en français` should produce a French reply.

If you want a persistent default language, set it in **Settings → Writing Style & Language**.

If you need to change Ghostwriter's base behavior more deeply, edit the
Ghostwriter prompt template in **Settings → Prompt Templates**. That editor is
advanced on purpose: removing instructions or placeholders can make responses
less reliable, but reset restores the default template quickly.

`Do-not-use terms` are passed as guidance in the prompt. They are not enforced by a hard post-generation filter, so the model should avoid them but may still use them occasionally.

`Use Stop Slop for Ghostwriter` adds extra Ghostwriter-only instructions based on the Stop Slop skill. When enabled, Ghostwriter revises toward direct active voice, cuts filler and formulaic AI phrasing, avoids vague claims, and removes em dashes. It does not change resume tailoring.

Defaults:

- Tone: `professional`
- Formality: `medium`
- Constraints: empty
- Do-not-use terms: empty
- Use Stop Slop for Ghostwriter: disabled

### Context and safety model

- Job snapshot is truncated to fit prompt budget.
- Profile snapshot includes relevant slices only.
- Selected notes are truncated to the note-context limits shown in the UI.
- System prompt enforces read-only assistant behavior.
- Logging stores metadata, not full prompt/response dumps.

### API surface

- `GET /api/jobs/:id/chat/messages`
- `PATCH /api/jobs/:id/chat/context`
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
- Save extra context as job notes, select those notes in Ghostwriter, then regenerate.
- Regenerate after updating job notes or the job description.

### I need more reading space for long drafts

- On desktop, switch Ghostwriter to pop-up mode with the header expand button.
- Use restore when you want to return to the right-side drawer layout.

### I need to reuse a reply outside JobOps

- Use the `Copy` button shown on each completed Ghostwriter response.
- If the button changes to `Copied`, the full reply is already on your clipboard.

## Related pages

- [Settings](/docs/next/features/settings)
- [Reactive Resume](/docs/next/features/reactive-resume)
- [Orchestrator](/docs/next/features/orchestrator)
