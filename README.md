# JobOps

AI-powered job discovery and application pipeline. Automatically finds jobs, scores them against your profile, and generates tailored resumes.

## Workflow

1. **Search**: Scrapes Gradcracker, Indeed, LinkedIn, Glassdoor, and UK Visa Sponsorship jobs.
2. **Score**: AI ranks jobs by suitability using the configured LLM provider (OpenRouter by default).
3. **Tailor**: Generates a custom resume summary for top-tier matches.
4. **Export**: Uses [RxResume v4](https://v4.rxresu.me) to create tailored PDFs.
5. **Manage**: Review and mark jobs as "Applied" via the dashboard (calls webhooks for lifecycle events).
6. **Track**: Connect your Gmail to automatically track post-application emails (interviews, offers, rejections) via the **Tracking Inbox**. The Smart Router AI matches emails to your applied jobs and updates job application status automatically.

## Example of generating a tailored resume for a job

https://github.com/user-attachments/assets/5b9157a9-13b0-4ec6-9bd2-a39dbc2b11c5

## Example of applying to a Ready job

https://github.com/user-attachments/assets/06e5e782-47f5-42d0-8b28-b89102d7ea1b

## How to Start

### Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)

### Overview

- Run the app with Docker (this pulls the pre-built image).
- Create accounts:
  - OpenRouter (LLM scoring/tailoring)
  - RxResume v4 (PDF export + editable resume data)

- Open the dashboard and complete the onboarding wizard:
  - Add API keys/credentials
  - Choose a resume template from RxResume
  - Run the pipeline to fetch jobs → score → tailor → export PDFs

- Review jobs in the dashboard and mark stages
- (Optional) Connect Gmail to enable automatic post-application email tracking

### Post-Application Tracking (Optional)

Once you've applied to jobs, connect your Gmail account to automatically track responses:

1. Go to **Tracking Inbox** in the dashboard
2. Click **Connect Gmail** and authorize access
3. The Smart Router AI will analyze incoming emails and match them to your applied jobs
4. High-confidence matches (95%+) are auto-linked; others appear in your Inbox for review
5. Interview invites, offers, and rejections automatically update your job timeline

See `documentation/self-hosting.md` for Gmail OAuth setup instructions.

### Quick Start (commands)

```bash
# 1. Clone and move to directory
git clone https://github.com/DaKheera47/job-ops.git
cd job-ops

# 2. Start with Docker (pulls pre-built image from GHCR)
docker compose up -d

# 3. Open the dashboard in your browser, the app will onboard your credentials
# http://localhost:3005
```

### Required accounts

- OpenRouter (LLM provider)
  - Create an account and generate an API key.

- RxResume v4
  - Create an account on v4.rxresu.me
  - The summary, title, chosen projects, and keywords in the Resume will be tailored for the job description
  - Recreate/import your resume there so JobOps can:
    - pick a template
    - generate tailored PDFs from your stored resume data

### App Onboarding

The app will guide you through setup on first launch. The onboarding wizard helps you:

- Configure the LLM provider (OpenRouter by default) and add an API key if required (for AI scoring/tailoring)
- Add your RxResume credentials (for PDF export via v4.rxresu.me)
- Select a template resume from your v4.rxresu.me account

## Technical Details

- Technical breakdowns here: `documentation/extractors/README.md`
- Orchestrator docs here: `documentation/orchestrator.md`
- Post-application tracking: `documentation/post-application-tracking.md`
- Full documentation index: `documentation/README.md`
- Persistent data lives in `./data` (bind-mounted into the container).

## Notes / sharp edges

- **Crawl targets**: edit `extractors/gradcracker/src/main.ts` to change the Gradcracker location/role matrix.
- **Pipeline config knobs**: `POST /api/pipeline/run` accepts `{ topN, minSuitabilityScore }`; `PIPELINE_TOP_N`/`PIPELINE_MIN_SCORE` are used by `npm run pipeline:run` (CLI runner).
- **Anti-bot reality**: crawling is headless + "humanized", but sites can still block; expect occasional flakiness.

Note on Analytics: The current alpha version includes anonymous analytics (Umami) to help me debug performance. This will be made opt-in only in the upcoming updates. If you want to disable it now, block umami.dakheera47.com in your firewall.

# Contact

If you need any help with any step of the process, feel free to open an [issue](https://github.com/DaKheera47/job-ops/issues). I am actively monitoring this section and I would be extremely happy to help you get up and running!

## Star History

<a href="https://www.star-history.com/#DaKheera47/job-ops&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&legend=top-left" />
 </picture>
</a>

## License

AGPLv3
