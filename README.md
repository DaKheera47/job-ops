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

## What is JobOps?

JobOps searches LinkedIn, Indeed, Glassdoor and 10+ job boards from one screen, rewrites your CV for each role, scores your fit, checks visa sponsorship status, and tracks every application in one place.

It does not auto-apply. Recruiters can tell when applications are automated and it gets you blacklisted. JobOps gives you the speed without sacrificing quality.

<div align="center">

https://github.com/user-attachments/assets/ec5bc249-aad5-41f2-b1ff-f7b3b6e6f7b8

</div>

---

## Quick Start

Prefer a guided walkthrough? Follow the [Self-Hosting Guide](https://jobops.dakheera47.com/docs/getting-started/self-hosting).

```bash
git clone https://github.com/DaKheera47/job-ops.git
cd job-ops
docker compose up -d
```

Open `http://localhost:3005` and follow the onboarding wizard. You'll be searching in under 10 minutes.

---

## How It Works

| Step | What happens |
|------|-------------|
| **Search** | Scrapes 10+ job boards for roles matching your criteria |
| **Score** | AI ranks each job 0-100 against your profile |
| **Tailor** | Generates a rewritten CV matched to each job description |
| **Export** | Creates a polished PDF locally, or via [Reactive Resume](https://rxresu.me) |
| **Track** | Connects to Gmail and auto-detects interviews, offers, and rejections |

---

## Supported Job Boards

| Platform | Focus |
|----------|-------|
| LinkedIn | Global |
| Indeed | Global |
| Glassdoor | Global |
| Adzuna | Multi-country API |
| Hiring Cafe | Global |
| startup.jobs | Startup/remote roles |
| Working Nomads | Remote-only |
| Gradcracker | STEM/Grads (UK) |
| UK Visa Jobs | Sponsorship (UK) |
| Golang Jobs | Go developers |

Custom extractors can be added via TypeScript. See the [extractor docs](https://jobops.dakheera47.com/docs/extractors/overview).

---

## Post-Application Tracking

Connect your Gmail and JobOps watches for recruiter replies automatically.

- *"We'd like to invite you to interview..."* → Status updates to **Interviewing**
- *"Unfortunately we won't be progressing..."* → Status updates to **Rejected**

No manual updates. No spreadsheets. See the [tracking docs](https://jobops.dakheera47.com/docs/features/post-application-tracking) for setup.

---

## AI Providers

JobOps works with the model provider you already use:

- Codex (local app-server in Docker, authenticated with `codex login`)
- OpenAI
- Google Gemini
- OpenRouter
- Any OpenAI-compatible endpoint (Ollama, LM Studio, etc.)

---

## Cloud

Don't want to self-host? JobOps Cloud gives you your own hosted instance with nothing to install.

<div align="center">

| | BYOK | Zero Setup |
|---|:---:|:---:|
| **Price** | £20/month | £50/month |
| **All features** | ✓ | ✓ |
| **Your own instance** | ✓ | ✓ |
| **Managed updates** | ✓ | ✓ |
| **AI provider** | Bring your own key | Included, no config needed |
| | [Get Started](https://buy.stripe.com/bJeeVc67v9S42AFeWj4c800) | [Get Started](https://buy.stripe.com/dRmbJ0cvT2pC2AF6pN4c801) |

</div>

Self-hosted will always be free and open source.

---

## Documentation

- [Documentation Home](https://jobops.dakheera47.com/docs/)
- [Self-Hosting Guide](https://jobops.dakheera47.com/docs/getting-started/self-hosting)
- [Feature Overview](https://jobops.dakheera47.com/docs/features/overview)
- [Orchestrator Pipeline](https://jobops.dakheera47.com/docs/features/orchestrator)
- [Extractor System](https://jobops.dakheera47.com/docs/extractors/overview)
- [Troubleshooting](https://jobops.dakheera47.com/docs/troubleshooting/common-problems)

---

## Contributing

Contributions are welcome. Whether it's code, docs, or new extractors, start with [`CONTRIBUTING.md`](./CONTRIBUTING.md).

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

## License

**AGPLv3 + Commons Clause**

You can self-host, use, and modify JobOps freely. You cannot sell the software itself or offer paid hosted services whose value substantially comes from JobOps. See [LICENSE](LICENSE).

---

<div align="center">

Built by [Shaheer Sarfaraz](https://github.com/DaKheera47)

[Website](https://jobops.app) · [Cloud](https://jobops.app) · [Documentation](https://jobops.dakheera47.com/docs/) · [Ko-fi](https://ko-fi.com/shaheersarfaraz)

</div>
