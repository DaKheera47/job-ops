# JobOps Documentation

Welcome to the JobOps documentation. This folder contains comprehensive guides for setting up, configuring, and using JobOps.

## Getting Started

- **[Self-Hosting Guide](./self-hosting.md)** - Deploy JobOps with Docker Compose
  - Docker setup instructions
  - Gmail OAuth configuration for email tracking
  - Environment variables reference
  - Demo mode deployment

## Feature Documentation

- **[Orchestrator](./orchestrator.md)** - Core job workflow and PDF generation
  - Job states explained (discovered, ready, applied, etc.)
  - The "Ready" flow (manual vs auto)
  - PDF generation and regeneration
  - Post-application tracking overview

- **[Post-Application Tracking](./post-application-tracking.md)** - Email-to-job matching
  - How the Smart Router AI works
  - Gmail integration setup
  - Using the Tracking Inbox
  - Privacy and security details
  - API reference

## Extractors

JobOps uses specialized extractors to gather jobs from different sources:

- **[Extractors Overview](./extractors/README.md)** - Architecture and how extractors work
- **[Gradcracker](./extractors/gradcracker.md)** - UK graduate jobs and internships
- **[UKVisaJobs](./extractors/ukvisajobs.md)** - UK visa sponsorship jobs
- **[JobSpy](./extractors/jobspy.md)** - Multi-platform job aggregator (Indeed, LinkedIn, etc.)
- **[Manual Import](./extractors/manual.md)** - Import jobs from URLs or text

## Quick Reference

### Main Components

- **Orchestrator** - Main application (UI, API, database)
- **Extractors** - Specialized job crawlers
- **Shared** - Common types and utilities

### Key Features

1. **Job Discovery** - Automatically find jobs from multiple sources
2. **AI Scoring** - Rank jobs by suitability for your profile
3. **Resume Tailoring** - Generate custom resumes for each job
4. **PDF Export** - Create tailored PDFs via RxResume integration
5. **Application Tracking** - Monitor your applied jobs
6. **Email Tracking** - Auto-track post-application responses (interviews, offers, rejections)

### Documentation Structure

```
documentation/
├── self-hosting.md          # Deployment guide
├── orchestrator.md          # Core workflow documentation
├── post-application-tracking.md  # Email tracking feature
└── extractors/              # Job source extractors
    ├── README.md
    ├── gradcracker.md
    ├── jobspy.md
    ├── manual.md
    ├── ukvisajobs.md
    └── gradcracker.md
```

## Contributing to Documentation

When adding new features:

1. Update the relevant feature documentation
2. Add API endpoint documentation to orchestrator README
3. Update this index if adding new docs
4. Include mermaid diagrams for complex workflows
5. Provide practical examples

## Support

- Open an [issue](https://github.com/DaKheera47/job-ops/issues) for documentation errors
- Check existing docs before asking questions
- See main README for general project info
