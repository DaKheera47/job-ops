# JobOps: Your Ironman Suit for Job Hunting


<a href="https://trendshift.io/repositories/22756" target="_blank"><img src="https://trendshift.io/api/badge/repositories/22756" alt="DaKheera47%2Fjob-ops | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

[![Stars](https://img.shields.io/github/stars/DaKheera47/job-ops?style=social)](https://github.com/DaKheera47/job-ops)
[![GHCR](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker&logoColor=white)](https://github.com/DaKheera47/job-ops/pkgs/container/job-ops)
[![Release](https://github.com/DaKheera47/job-ops/actions/workflows/ghcr.yml/badge.svg)](https://github.com/DaKheera47/job-ops/actions/workflows/ghcr.yml)
[![Contributors](https://img.shields.io/github/contributors-anon/dakheera47/job-ops)](Contributors)
[![Cloud Waitlist](https://img.shields.io/badge/Cloud-Join_Waitlist-orange?style=flat-square)](https://try.jobops.app?utm_source=github&utm_medium=badge&utm_campaign=waitlist)

<img width="1200" height="600" alt="2k" src="https://github.com/user-attachments/assets/14fdc392-0e96-43be-bc1f-cf819ab2afc4" />

Stop applying blind.

Scrapes major job boards (LinkedIn, Indeed, Glassdoor & more), AI-scores suitability, tailors resumes (RxResume), and tracks application emails automatically.

You still apply to every job yourself. JobOps just finds jobs, makes sure you're applying to the right ones with a tailored CV, and not losing track of where you're at.

Self-hosted. Docker-based.

## 40s Demo: Crawl -> Score -> PDF -> Track

<details>
<summary>
Pipeline Demo
</summary>
  
  https://github.com/user-attachments/assets/5b9157a9-13b0-4ec6-9bd2-a39dbc2b11c5
</details>


<details>
<summary>
Apply & Track
</summary>
  
  https://github.com/user-attachments/assets/06e5e782-47f5-42d0-8b28-b89102d7ea1b
</details>

## Documentation (Start Here)

JobOps ships with full docs for setup, architecture, extractors, and troubleshooting.

If you want the serious view of the project, start here:

- [Documentation Home](https://jobops.dakheera47.com/docs/)
- [Self-Hosting Guide](https://jobops.dakheera47.com/docs/getting-started/self-hosting)
- [Feature Overview](https://jobops.dakheera47.com/docs/features/overview)
- [Orchestrator Pipeline](https://jobops.dakheera47.com/docs/features/orchestrator)
- [Extractor System](https://jobops.dakheera47.com/docs/extractors/overview)
- [Troubleshooting](https://jobops.dakheera47.com/docs/troubleshooting/common-problems)

## Quick Start (10 Min)

Prefer guided setup? Follow the [Self-Hosting Guide](https://jobops.dakheera47.com/docs/getting-started/self-hosting).

```bash
# 1. Download
git clone https://github.com/DaKheera47/job-ops.git
cd job-ops

# 2. Start (Pulls pre-built image)
docker compose up -d

# 3. Launch Dashboard
# Open http://localhost:3005 to start the onboarding wizard

```

## Why JobOps?

* **Universal Scraping**: Supports **LinkedIn, Indeed, Glassdoor, Adzuna, Hiring Cafe, startup.jobs, Working Nomads, Gradcracker, UK Visa Jobs**.
* **AI Scoring**: Ranks jobs by fit against *your* profile using your preferred LLM (OpenAI, OpenRouter, `openai-compatible` endpoints such as LM Studio/Ollama, Gemini).
* **Auto-Tailoring**: Generates custom resumes (PDFs) for every application using RxResume v4.
* **Email Tracking**: Connect Gmail to auto-detect interviews, offers, and rejections.
* **Self-Hosted**: Your data stays with you. SQLite database. No SaaS fees.

## Workflow

1. **Search**: Scrapes job boards for roles matching your criteria.
2. **Score**: AI ranks jobs (0-100) based on your resume/profile.
3. **Tailor**: Generates a custom resume summary & keyword optimization for top matches.
4. **Export**: Uses [RxResume v4](https://v4.rxresu.me) to create tailored PDFs.
5. **Track**: "Smart Router" AI watches your inbox for recruiter replies.

## Supported Extractors

| Platform | Focus |
| --- | --- |
| **LinkedIn** | Global / General |
| **Indeed** | Global / General |
| **Glassdoor** | Global / General |
| **Adzuna** | Multi-country API source |
| **Hiring Cafe** | Global / General |
| **startup.jobs** | Startup-focused remote roles |
| **Working Nomads** | Remote-only curated jobs |
| **Gradcracker** | STEM / Grads (UK) |
| **UK Visa Jobs** | Sponsorship (UK) |

*(More extractors can be added via TypeScript - see [extractors documentation](https://jobops.dakheera47.com/docs/extractors/overview))*

## Post-App Tracking (Killer Feature)

Connect Gmail -> AI routes emails to your applied jobs.

* "We'd like to interview you..." -> **Status: Interviewing** (Auto-updated)
* "Unfortunately..." -> **Status: Rejected** (Auto-updated)

See [post-application tracking docs](https://jobops.dakheera47.com/docs/features/post-application-tracking) for setup.

**Note on Analytics**: The alpha version includes anonymous analytics (Umami) to help debug performance. To opt-out, block `umami.dakheera47.com` in your firewall/DNS.

## Cloud Version (Coming Soon)

Self-hosting not your thing? A hosted version of JobOps is coming.

- No Docker required
- Up and running in 2 minutes
- Managed updates
- Self-hosted will always be free and open source

Join the waitlist at [https://try.jobops.app](https://try.jobops.app?utm_source=github&utm_medium=readme&utm_campaign=waitlist)
<br>
Support me on [kofi](https://ko-fi.com/shaheersarfaraz)

## Contributing

Want to contribute code, docs, or extractors? Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md).


## Star History

<a href="https://www.star-history.com/#DaKheera47/job-ops&type=date&legend=top-left">
<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&theme=dark&legend=top-left" />
<source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&legend=top-left" />
<img alt="Star History Chart" src="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&legend=top-left" />
</picture>
</a>

## License

**AGPLv3 + Commons Clause** - You can self-host, use, and modify JobOps, but
you cannot sell the software itself or offer paid hosted/support services whose
value substantially comes from JobOps. See [LICENSE](LICENSE).
