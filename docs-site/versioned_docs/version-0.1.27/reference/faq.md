---
id: faq
title: FAQ
description: Frequently asked questions about deployment, docs, and operations.
sidebar_position: 1
---

## Is docs content bundled for self-hosted installs?

Yes. The docs static build is bundled and served locally at `/docs`.

## How are docs versions managed?

Docs are versioned using Docusaurus versions, intended to map to release tags.

## Where should contributors edit docs?

Edit files under `docs-site/docs` for latest docs.

## What does this cost in practice?

Real-world reference: from early December 2025 to mid-February 2026, with heavy usage and testing (about 10 to 15 applications per day), easily more than 3000 jobs scored, total LLM spend was about **$12 USD** using Gemini 3 Flash through OpenRouter.

Cost varies by:

- selected model/provider
- prompt volume and size
- number of jobs scored/tailored per run

For this workload, Gemini 3 Flash has been low-cost while still producing high-quality outputs.
