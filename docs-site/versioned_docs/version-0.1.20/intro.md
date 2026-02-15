---
id: intro
title: JobOps Documentation
description: Documentation index for setup, features, extractors, and common problems.
sidebar_position: 1
slug: /
---

Welcome to the JobOps documentation. This site contains guides for setup, configuration, and day-to-day usage.

## Getting Started

- **[Self-Hosting Guide](/docs/getting-started/self-hosting)**
  - Docker setup instructions
  - Gmail OAuth configuration for email tracking
  - Environment variables reference
  - Demo mode deployment

## Feature Documentation

- **[Orchestrator](/docs/features/orchestrator)**
  - Job states explained (`discovered`, `ready`, `applied`, etc.)
  - The ready flow (manual vs auto)
  - PDF generation and regeneration
  - Post-application tracking overview

- **[Ghostwriter](/docs/features/ghostwriter)**
  - One persistent conversation per job
  - Streaming responses, stop, and regenerate
  - Markdown rendering and drawer behavior
  - Writing style settings impact

- **[Post-Application Tracking](/docs/features/post-application-tracking)**
  - How the Smart Router AI works
  - Gmail integration setup
  - Using the Tracking Inbox
  - Privacy and security details
  - API reference

## Extractors

- **[Extractors Overview](/docs/extractors/overview)**
- **[Gradcracker](/docs/extractors/gradcracker)**
- **[UKVisaJobs](/docs/extractors/ukvisajobs)**
- **[JobSpy](/docs/extractors/jobspy)**
- **[Manual Import](/docs/extractors/manual)**

## Quick Reference

### Main Components

- **Orchestrator**: Main application (UI, API, database)
- **Extractors**: Specialized job crawlers
- **Shared**: Common types and utilities

### Key Features

1. **Job Discovery**: Automatically find jobs from multiple sources.
2. **AI Scoring**: Rank jobs by suitability for your profile.
3. **Resume Tailoring**: Generate custom resumes for each job.
4. **PDF Export**: Create tailored PDFs via RxResume integration.
5. **Application Tracking**: Monitor your applied jobs.
6. **Email Tracking**: Auto-track post-application responses.

## Contributing to Documentation

When adding user-visible behavior:

1. Update the relevant feature page in current docs.
2. Add API documentation where relevant.
3. Keep examples realistic and copy-pasteable.
4. Include diagrams for non-trivial workflows.

## Support

- Open an [issue](https://github.com/DaKheera47/job-ops/issues) for documentation errors.
- Check these docs before opening support requests.
