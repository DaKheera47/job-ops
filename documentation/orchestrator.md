# Orchestrator: Job States and PDF Flow

This doc explains how the orchestrator thinks about job states, how the "Ready" flow is supposed to work, and how to generate or regenerate PDFs after edits.

## Job states (what each one means)

- `discovered`: The job was found by a crawler/import. It has not been processed into a tailored resume yet.
- `processing`: The system is currently generating tailoring data and/or the PDF.
- `ready`: A tailored PDF has been generated and the job is ready for you to apply.
- `applied`: You marked it as applied. If Notion is configured, a page is created and linked.
- `skipped`: You explicitly skipped it (so it stays out of your active queue).
- `expired`: Deadline has passed. This is a terminal state used for cleanup/triage.

## The intended "Ready" flow

There are two main ways a job becomes Ready:

1) **Manual flow (most common)**
   - A job starts in `discovered`.
   - You open it in the Discovered panel, decide to Tailor.
   - In Tailor mode you edit the job description (optional), summary, and project picks.
   - You click **Finalize & Move to Ready**.
   - This runs summarization (if needed), generates the PDF, and sets status to `ready`.

2) **Auto flow (pipeline top picks)**
   - The pipeline scores all discovered jobs.
   - It auto-processes the top N above the score threshold.
   - Those jobs go directly to `ready` with PDFs generated.

Once a job is `ready`, the Ready panel is the "shipping lane":

- View/download the PDF.
- Open the job listing.
- Mark Applied (moves to `applied` and syncs to Notion if configured).
- Optional: edit tailoring, edit the JD, or regenerate the PDF.

## Generating PDFs (first time)

The PDF is generated from:

- The base resume JSON (uploaded via the Onboarding UI or Settings).
- The job description (used for AI tailoring and project selection).
- Your tailored summary/headline/skills and selected projects.

Paths:

- **Discovered ? Tailor ? Finalize**
  - Calls `/api/jobs/:id/process`.
  - Runs AI summary + project selection, then generates the PDF.
  - Sets status to `ready` and saves `pdfPath`.

- **Ready panel ? Regenerate PDF**
  - Calls `/api/jobs/:id/generate-pdf` using the current saved tailoring fields.

## Regenerating PDFs after edits

If the job description or tailoring changes, regenerate the PDF so it stays in sync.

### Typical UI flow

1) Edit job description or tailoring in the Discovered/Tailor view, or use ?Edit job description? in Ready.
2) If you want AI to re-tailor based on the updated JD, click **Generate draft** (Discovered) or **AI Summarize** (editor).
3) Click **Finalize & Move to Ready** (if still in Discovered) or **Regenerate PDF** (if already Ready).

### API flow (for automation)

1) Update the data:

```bash
PATCH /api/jobs/:id
{
  "jobDescription": "<new JD>",
  "tailoredSummary": "<optional>",
  "selectedProjectIds": "p1,p2"
}
```

2) (Optional) re-run AI tailoring based on the new JD:

```bash
POST /api/jobs/:id/summarize?force=true
```

3) Generate the PDF using current stored fields:

```bash
POST /api/jobs/:id/generate-pdf
```

## Notes and gotchas

- `processing` is transient. If PDF generation fails, the job is reverted back to `discovered`.
- The PDF is served at `/pdfs/resume_<jobId>.pdf` and cache-busted with the job?s `updatedAt` timestamp.
- If a job is `skipped` or `applied` and you want to re-open it, you can PATCH its `status` back to `discovered`.
