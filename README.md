# JobOps ✨ AI Job Hunter & Resume Tailor

**Automate the hunt.** Scrapes major job boards (LinkedIn, Indeed, Glassdoor), **AI-scores suitability**, **tailors resumes** (RxResume), and **tracks application emails** automatically.

Self-hosted. Docker-based. **Stop applying manually.**

[![Stars](https://img.shields.io/github/stars/DaKheera47/job-ops?style=social)](https://github.com/DaKheera47/job-ops)
[![GHCR](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker&logoColor=white)](https://github.com/DaKheera47/job-ops/pkgs/container/job-ops)
[![License](https://img.shields.io/github/license/DaKheera47/job-ops)](LICENSE)
[![Contributors](https://img.shields.io/github/contributors-anon/dakheera47/job-ops)](Contributors)


## 🎥 40s Demo: Crawl → Score → PDF → Track

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

## 🚀 Quick Start (10 Min)
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

* **Universal Scraping**: Supports **LinkedIn, Indeed, Glassdoor** + specialized boards (Gradcracker, UK Visa Jobs).
* **AI Scoring**: Ranks jobs by fit against *your* profile using your preferred LLM (OpenRouter/OpenAI/Gemini).
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
| **Gradcracker** | STEM / Grads (UK) |
| **UK Visa Jobs** | Sponsorship (UK) |

*(More extractors can be added via TypeScript - see `documentation/extractors`)*

## Post-App Tracking (Killer Feature)

Connect Gmail → AI routes emails to your applied jobs.

* "We'd like to interview you..." → **Status: Interviewing** (Auto-updated)
* "Unfortunately..." → **Status: Rejected** (Auto-updated)

See `documentation/post-application-tracking.md` for setup.

## Accounts & Setup

| Service | Role | Cost |
| --- | --- | --- |
| **OpenRouter** | AI Intelligence | Pay-as-you-go |
| **RxResume v4** | PDF Generation | Free |
| **Gmail** | Email Tracking | Free (Optional) |

The onboarding wizard at `localhost:3005` will guide you through connecting these services.

## Documentation

* [Extractors Guide](https://www.google.com/search?q=documentation/extractors/README.md) - How to configure crawl targets.
* [Orchestrator](https://www.google.com/search?q=documentation/orchestrator.md) - How the pipeline works.
* [Self-Hosting](https://www.google.com/search?q=documentation/self-hosting.md) - Advanced Docker & Gmail setup.
* [Tracking](https://www.google.com/search?q=documentation/post-application-tracking.md) - Email integration details.

**Note on Analytics**: The alpha version includes anonymous analytics (Umami) to help debug performance. To opt-out, block `umami.dakheera47.com` in your firewall/DNS.

## Star History

<a href="https://www.star-history.com/#DaKheera47/job-ops&type=date&legend=top-left">
<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&theme=dark&legend=top-left" />
<source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&legend=top-left" />
<img alt="Star History Chart" src="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&legend=top-left" />
</picture>
</a>

## License

**AGPLv3** - Free to use and modify.
