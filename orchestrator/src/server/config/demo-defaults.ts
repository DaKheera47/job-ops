import type { JobSource } from "@shared/types";
import {
  COMPANY_PREFIXES,
  COMPANY_SUFFIXES,
  DEMO_BASELINE_NAME,
  DEMO_BASELINE_VERSION,
  DEMO_BASE_JOBS,
  DEMO_BASE_STAGE_EVENTS,
  DEMO_DEFAULT_PIPELINE_RUNS,
  DEMO_DEFAULT_SETTINGS,
  DEMO_GENERATED_APPLIED_JOB_COUNT as GENERATED_APPLIED_JOB_COUNT,
  DEMO_PROJECT_CATALOG,
  DEMO_SOURCE_BASE_URLS,
  type DemoDefaultJob,
  type DemoDefaultPipelineRun,
  type DemoDefaultSettings,
  type DemoDefaultStageEvent,
} from "./demo-defaults.data";

function makeDemoCompany(index: number): string {
  const prefix = COMPANY_PREFIXES[index % COMPANY_PREFIXES.length];
  const suffix = COMPANY_SUFFIXES[(index * 7 + 3) % COMPANY_SUFFIXES.length];
  const mode = index % 4;
  if (mode === 1) return `${prefix}-${suffix}`;
  if (mode === 2) return `${prefix} ${suffix} Co.`;
  if (mode === 3) return `${prefix} ${suffix} Inc.`;
  return `${prefix} ${suffix}`;
}

function sourceBaseUrl(source: JobSource): string {
  return DEMO_SOURCE_BASE_URLS[source];
}

const DEMO_GENERATED_APPLIED_JOBS: DemoDefaultJob[] = Array.from(
  { length: GENERATED_APPLIED_JOB_COUNT },
  (_, idx) => {
    const n = idx + 1;
    const sourceCycle: JobSource[] = [
      "linkedin",
      "indeed",
      "gradcracker",
      "ukvisajobs",
      "manual",
    ];
    const source = sourceCycle[idx % sourceCycle.length];
    const appliedDaysAgo = 2 + Math.floor((idx * 28) / GENERATED_APPLIED_JOB_COUNT);
    const appliedOffsetMinutes = appliedDaysAgo * 24 * 60 + (idx % 16) * 15;
    const discoveredOffsetMinutes =
      appliedOffsetMinutes + (2 + (idx % 9)) * 24 * 60 + (idx % 5) * 60;
    const score = 68 + (idx % 24);
    const roleTrack = [
      "Backend Engineer",
      "Software Engineer",
      "Senior Backend Engineer",
      "Platform Engineer",
      "Full Stack Engineer",
      "TypeScript Engineer",
    ] as const;
    const role = roleTrack[idx % roleTrack.length];
    const employer = makeDemoCompany(idx + 10);
    const selectedProjectSets = [
      "demo-project-1,demo-project-4,demo-project-5",
      "demo-project-1,demo-project-2,demo-project-4",
      "demo-project-2,demo-project-3,demo-project-4",
      "demo-project-2,demo-project-4,demo-project-5",
    ] as const;
    const selectedProjectIds = selectedProjectSets[idx % selectedProjectSets.length];

    return {
      id: `demo-job-applied-auto-${n}`,
      source,
      title: `${role} (${["Core Platform", "Integrations", "Data", "Reliability"][idx % 4]})`,
      employer,
      jobUrl: sourceBaseUrl(source),
      applicationLink: sourceBaseUrl(source),
      location: ["Remote (US)", "New York, NY", "Chicago, IL", "Austin, TX"][
        idx % 4
      ],
      salary: `$${115 + (idx % 11) * 5},000 - $${135 + (idx % 11) * 5},000`,
      deadline: `2026-0${(idx % 6) + 3}-${String((idx % 26) + 1).padStart(2, "0")}`,
      jobDescription:
        "Build and improve backend workflow systems, API contracts, and operational tooling. Partner with product and operations to increase reliability, reduce manual effort, and improve delivery throughput.",
      status: "applied",
      discoveredOffsetMinutes,
      appliedOffsetMinutes,
      suitabilityScore: score,
      suitabilityReason:
        "Good-to-strong fit based on TypeScript backend delivery, workflow automation ownership, and observability practices. Alignment is strongest on API reliability and production operations.",
      tailoredSummary:
        "Backend engineer with experience shipping resilient TypeScript services, improving queue and workflow reliability, and tightening API contracts for operational safety.",
      tailoredHeadline: `${role} with systems and reliability focus`,
      tailoredSkills: ["TypeScript", "Node.js", "APIs", "Observability"],
      selectedProjectIds,
      pdfPath: `/pdfs/demo-job-applied-auto-${n}.pdf`,
      notionPageId: `demo-notion-applied-auto-${n}`,
    };
  },
);

export const DEMO_DEFAULT_JOBS: DemoDefaultJob[] = [
  ...DEMO_BASE_JOBS,
  ...DEMO_GENERATED_APPLIED_JOBS,
];

const DEMO_GENERATED_STAGE_EVENTS: DemoDefaultStageEvent[] =
  DEMO_GENERATED_APPLIED_JOBS.flatMap((job, idx) => {
    const n = idx + 1;
    const appliedOffset = job.appliedOffsetMinutes ?? 0;
    const events: DemoDefaultStageEvent[] = [
      {
        id: `demo-event-auto-applied-${n}`,
        applicationId: job.id,
        fromStage: null,
        toStage: "applied",
        title: "Applied (seeded demo)",
        occurredOffsetMinutes: appliedOffset,
        metadata: { eventLabel: "Applied", actor: "system" },
      },
    ];

    if (idx % 3 === 0) {
      events.push({
        id: `demo-event-auto-screen-${n}`,
        applicationId: job.id,
        fromStage: "applied",
        toStage: "recruiter_screen",
        title: "Recruiter screening",
        occurredOffsetMinutes: Math.max(appliedOffset - 24 * 60, 15),
        metadata: { eventLabel: "Recruiter Screen", actor: "user" },
      });
    }
    if (idx % 6 === 0) {
      events.push({
        id: `demo-event-auto-tech-${n}`,
        applicationId: job.id,
        fromStage: "recruiter_screen",
        toStage: "technical_interview",
        title: "Technical interview",
        occurredOffsetMinutes: Math.max(appliedOffset - 2 * 24 * 60, 15),
        metadata: { eventLabel: "Technical Interview", actor: "user" },
      });
    }
    if (idx % 12 === 0) {
      events.push({
        id: `demo-event-auto-offer-${n}`,
        applicationId: job.id,
        fromStage: "technical_interview",
        toStage: "offer",
        title: "Offer received",
        occurredOffsetMinutes: Math.max(appliedOffset - 3 * 24 * 60, 15),
        metadata: { eventLabel: "Offer", actor: "user" },
      });
    } else if (idx % 10 === 0) {
      events.push({
        id: `demo-event-auto-closed-${n}`,
        applicationId: job.id,
        fromStage: "recruiter_screen",
        toStage: "closed",
        title: "Closed without offer",
        occurredOffsetMinutes: Math.max(appliedOffset - 2 * 24 * 60, 15),
        metadata: {
          eventLabel: "Closed",
          actor: "user",
          reasonCode: "rejected",
        },
      });
    }

    return events;
  });

export const DEMO_DEFAULT_STAGE_EVENTS: DemoDefaultStageEvent[] = [
  ...DEMO_BASE_STAGE_EVENTS,
  ...DEMO_GENERATED_STAGE_EVENTS,
];

export {
  DEMO_BASELINE_NAME,
  DEMO_BASELINE_VERSION,
  DEMO_DEFAULT_PIPELINE_RUNS,
  DEMO_DEFAULT_SETTINGS,
  DEMO_PROJECT_CATALOG,
};

export type {
  DemoDefaultJob,
  DemoDefaultPipelineRun,
  DemoDefaultSettings,
  DemoDefaultStageEvent,
};
