<div align="center">

# Job<span>Ops</span>

**One search across every board. One click to tailor your CV. One place to track it all.**

Your ironman suit for job hunting. You still apply to every job yourself. JobOps just makes you ten times faster.

<br>

<a href="https://trendshift.io/repositories/22756" target="_blank"><img src="https://trendshift.io/api/badge/repositories/22756" alt="DaKheera47%2Fjob-ops | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

[![Stars](https://img.shields.io/github/stars/DaKheera47/job-ops?style=social)](https://github.com/DaKheera47/job-ops)
[![GHCR](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker&logoColor=white)](https://github.com/DaKheera47/job-ops/pkgs/container/job-ops)
[![Release](https://github.com/DaKheera47/job-ops/actions/workflows/ghcr.yml/badge.svg)](https://github.com/DaKheera47/job-ops/actions/workflows/ghcr.yml)
[![Contributors](https://img.shields.io/github/contributors-anon/dakheera47/job-ops)](https://github.com/DaKheera47/job-ops/graphs/contributors)

<br>

800+ users · 4,000+ job searches run · #3 on GitHub Trending for TypeScript

<br>

<img width="1200" height="600" alt="JobOps Dashboard" src="https://github.com/user-attachments/assets/14fdc392-0e96-43be-bc1f-cf819ab2afc4" />

</div>

---

## Why JobOps?

JobOps searches LinkedIn, Indeed, Glassdoor and 10+ job boards from one screen, rewrites your CV for each role, scores your fit, checks visa sponsorship status, and tracks every application in one place.

**It does not auto-apply.** Recruiters can tell when applications are automated and it gets you blacklisted. JobOps gives you the speed without sacrificing quality.

| | |
|:---|:---|
| 🔍 **Search once, everywhere** | AI-powered scraping across 12+ job boards |
| 📄 **CV tailoring in seconds** | One-click rewrite matched to any job description |
| 🎯 **Fit scoring 0-100** | AI ranks jobs against your profile |
| 🌍 **Visa sponsorship check** | Instantly filter roles that sponsor |
| 📧 **Auto-tracking** | Gmail integration detects interviews & offers |

---

## Quick Start

```bash
git clone https://github.com/DaKheera47/job-ops.git
cd job-ops
docker compose up -d
```

Open `http://localhost:3005` — you'll be searching in under 10 minutes.

> **Prefer a guided walkthrough?** Follow the [Self-Hosting Guide](https://jobops.dakheera47.com/docs/getting-started/self-hosting).

---

## How It Works

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   SEARCH    │ →  │   SCORE     │ →  │   TAILOR    │ →  │   TRACK     │
│ 12+ boards  │    │ AI ranks    │    │ CV rewrite  │    │ Gmail sync  │
│ one query   │    │ 0-100 fit   │    │ one click   │    │ auto-updates│
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

| Step | What happens |
|------|---------------|
| **Search** | Scrapes LinkedIn, Indeed, Glassdoor, Adzuna, and 8+ more |
| **Score** | AI evaluates fit based on your profile vs. job requirements |
| **Tailor** | Generates a rewritten CV matched to each job description |
| **Export** | Creates a polished PDF locally, or via [Reactive Resume](https://rxresu.me) |
| **Track** | Watches Gmail for recruiter replies → auto-updates status |

---

## Supported Job Boards

| Platform | Focus | Platform | Focus |
|----------|-------|----------|-------|
| LinkedIn | Global | startup.jobs | Startup/remote |
| Indeed | Global | Working Nomads | Remote-only |
| Glassdoor | Global | Gradcracker | STEM/Grads (UK) |
| Adzuna | Multi-country | UK Visa Jobs | Sponsorship (UK) |
| Hiring Cafe | Global | Golang Jobs | Go developers |

Custom extractors can be added via TypeScript. See the [extractor docs](https://jobops.dakheera47.com/docs/extractors/overview).

---

## Post-Application Tracking

Connect your Gmail and JobOps watches for recruiter replies automatically:

- *"We'd like to invite you to interview..."* → Status updates to **Interviewing**
- *"Unfortunately we won't be progressing..."* → Status updates to **Rejected**

No manual updates. No spreadsheets.

[→ Set up tracking](https://jobops.dakheera47.com/docs/features/post-application-tracking)

---

## AI Providers

Bring your own model — JobOps works with what you already use:

- **Codex** — local app-server in Docker, authenticated with `codex login`
- **OpenAI** — GPT-4, GPT-4o, GPT-4o mini
- **Google Gemini** — Gemini Pro, Flash
- **OpenRouter** — 100+ models via unified API
- **Any OpenAI-compatible endpoint** — Ollama, LM Studio, local models

---

## Cloud

Don't want to self-host? JobOps Cloud gives you your own hosted instance.

| | BYOK | Zero Setup |
|---|:---:|:---:|
| **Price** | £20/month | £30/month |
| **All features** | ✓ | ✓ |
| **Your own instance** | ✓ | ✓ |
| **Managed updates** | ✓ | ✓ |
| **AI provider** | Bring your own key | Included, no config needed |
| | [Get Started](https://buy.stripe.com/bJeeVc67v9S42AFeWj4c800) | [Get Started](https://buy.stripe.com/dRmbJ0cvT2pC2AF6pN4c801) |

Self-hosted will always be free and open source.

---

## Documentation

| Getting Started | Features | Reference |
|-----------------|----------|-----------|
| [Self-Hosting](https://jobops.dakheera47.com/docs/getting-started/self-hosting) | [Overview](https://jobops.dakheera47.com/docs/features/overview) | [API](https://jobops.dakheera47.com/docs/reference/api) |
| [Configuration](https://jobops.dakheera47.com/docs/getting-started/configuration) | [Orchestrator](https://jobops.dakheera47.com/docs/features/orchestrator) | [Extractors](https://jobops.dakheera47.com/docs/extractors/overview) |
| [Troubleshooting](https://jobops.dakheera47.com/docs/troubleshooting/common-problems) | [Post-Application Tracking](https://jobops.dakheera47.com/docs/features/post-application-tracking) | [Deployment](https://jobops.dakheera47.com/docs/reference/deployment) |

---

## Contributing

Contributions are welcome — code, docs, or new extractors. Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md).

<a href="https://github.com/DaKheera47/job-ops/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=DaKheera47/job-ops" />
</a>

---

## Star History

<div align="center">

<a href="https://www.star-history.com/#DaKheera47/job-ops&type=date&legend=top-left">
<picture>
<source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&theme=dark&legend=top-left" />
<source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&legend=top-left" />
<img alt="Star History Chart" src="https://api.star-history.com/svg?repos=DaKheera47/job-ops&type=date&legend=top-left" />
</picture>
</a>

</div>

---
## Analytics

JobOps includes anonymous usage analytics (Umami) to help improve the product. To opt out, block `umami.dakheera47.com` in your firewall or DNS.

---

## License

**AGPLv3 + Commons Clause** — self-host, use, and modify freely. You cannot sell the software itself or offer paid hosted services whose value substantially comes from JobOps. See [LICENSE](LICENSE).

---

<div align="center">

Built by [Shaheer Sarfaraz](https://github.com/DaKheera47)

[Website](https://jobops.app) · [Cloud](https://jobops.app) · [Documentation](https://jobops.dakheera47.com/docs/) · [Ko-fi](https://ko-fi.com/shaheersarfaraz)

</div>
