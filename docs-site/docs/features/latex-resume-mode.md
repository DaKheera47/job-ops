---
id: latex-resume-mode
title: LaTeX Resume Mode
description: Use local LaTeX templates for tailored resume export without requiring Reactive Resume.
sidebar_position: 5
---

## What it is

LaTeX Resume Mode is an alternative resume export path that keeps the same Job Ops pipeline (`scrape -> score -> tailor -> export -> track`) but exports from local `.tex` templates instead of Reactive Resume.

In this mode, Job Ops generates:

- `CV_<Company>.tex`
- `CV_<Company>.pdf` when `pdflatex` is installed

Outputs are written per job in a deterministic folder:

- `data/pdfs/latex/<jobId>/`

## Why it exists

Some users want full control over resume layout and typography with custom LaTeX templates, while still keeping Job Ops automation.

LaTeX mode keeps tailoring and tracking in Job Ops, but lets you own template design and source files locally.

Migration note:

- **Reactive Resume is optional when LaTeX mode is enabled.**

## How to use it

1. Open **Settings**.
2. In **Resume Export**, set mode to **LaTeX**.
3. Set `LATEX_CV_TEMPLATE_PATH` (required).
4. Optionally set `LATEX_COVER_TEMPLATE_PATH`.
5. Click **Validate LaTeX Paths**.
6. Save settings and run tailoring/export from a job.

Environment variable example:

```bash
RESUME_EXPORT_MODE=latex
LATEX_CV_TEMPLATE_PATH=/absolute/path/to/cv-template.tex
LATEX_COVER_TEMPLATE_PATH=/absolute/path/to/cover-template.tex
```

Template substitution variables:

- `{{JOB_ID}}`
- `{{COMPANY}}`
- `{{JOB_TITLE}}`
- `{{TAILORED_SUMMARY}}`
- `{{TAILORED_HEADLINE}}`
- `{{TAILORED_SKILLS}}`

Runtime behavior:

- Job Ops reorders bullet points and skills lists by JD relevance.
- Job Ops does not rewrite your LaTeX structure/commands.
- Job Ops does not auto-apply to jobs; it only generates tailored artifacts.

## Common problems

### `LATEX_CV_TEMPLATE_PATH` validation fails

- Use an absolute path.
- Confirm the file exists and is readable by the Job Ops process.

### PDF is missing but `.tex` exists

- `pdflatex` is not installed or not on `PATH`.
- Job Ops still writes `.tex` output; install TeX tooling to enable `.pdf` compilation.

### Skills/bullets did not reorder as expected

- Reordering is keyword-based and depends on JD text quality.
- Include clearer technical keywords in the JD and regenerate.

## Related pages

- [Settings](/docs/features/settings)
- [Reactive Resume](/docs/features/reactive-resume)
- [Pipeline Run](/docs/features/pipeline-run)
