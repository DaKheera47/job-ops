# Ghostwriter

Ghostwriter is the per-job AI chat assistant in JobOps. It is optional to use and is designed for drafting application content with job-specific context already loaded.

## What Ghostwriter is for

Ghostwriter is not a generic chat box. For each job, it uses:

- The current job description and job metadata
- A reduced snapshot of your resume/profile
- Your global Ghostwriter writing style settings

This makes it useful for:

- Drafting role-specific answers
- Cover letter and outreach drafts
- Interview prep talking points tied to the current JD
- Rephrasing content to match your preferred style

## Where it appears

- Available from job details in `discovered` and `ready` flows
- Opens as a right-side drawer
- One persistent conversation per job

## Writing style settings impact

Ghostwriter settings are global and affect new generations:

- `Tone`: adds a tone instruction in the Ghostwriter system prompt
- `Formality`: adds a formality instruction
- `Constraints`: appended as explicit writing constraints
- `Do-not-use terms`: appended as language to avoid

Defaults:

- Tone: `professional`
- Formality: `medium`
- Constraints: empty
- Do-not-use terms: empty

## Context + safety model

Ghostwriter context is assembled server-side with size limits and sanitization:

- Job snapshot is truncated to fit prompt budget
- Profile snapshot includes only relevant slices (summary, skills, projects, experience)
- System prompt enforces read-only assistant behavior
- Logging stores metadata only (not raw full prompt/response dumps)

## API surface (current)

Primary per-job endpoints:

- `GET /api/jobs/:id/chat/messages`
- `POST /api/jobs/:id/chat/messages` (supports streaming)
- `POST /api/jobs/:id/chat/runs/:runId/cancel`
- `POST /api/jobs/:id/chat/messages/:assistantMessageId/regenerate` (supports streaming)

Compatibility endpoints for thread resources remain present, but UI behavior is one conversation per job.
