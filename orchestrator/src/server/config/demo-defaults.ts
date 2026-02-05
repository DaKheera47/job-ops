import type {
  JobStatus,
  JobSource,
  StageEventMetadata,
} from "@shared/types";
import type { SettingKey } from "@server/repositories/settings";

export const DEMO_BASELINE_VERSION = "2026.02.05.v1";
export const DEMO_BASELINE_NAME = "Public Demo Baseline";

export type DemoDefaultSettings = Partial<Record<SettingKey, string>>;

export const DEMO_DEFAULT_SETTINGS: DemoDefaultSettings = {
  llmProvider: "openrouter",
  model: "google/gemini-3-flash-preview",
  searchTerms: JSON.stringify([
    "software engineer",
    "backend engineer",
    "full stack engineer",
  ]),
  showSponsorInfo: "1",
  backupEnabled: "0",
  backupHour: "2",
  backupMaxCount: "5",
  jobspyLocation: "United States",
  jobspyResultsWanted: "25",
  jobspyHoursOld: "72",
  jobspyCountryIndeed: "US",
  jobspySites: JSON.stringify(["linkedin", "indeed"]),
  jobspyLinkedinFetchDescription: "1",
  jobspyIsRemote: "0",
};

export interface DemoDefaultPipelineRun {
  id: string;
  status: "completed" | "failed";
  startedOffsetMinutes: number;
  completedOffsetMinutes: number;
  jobsDiscovered: number;
  jobsProcessed: number;
  errorMessage?: string;
}

export const DEMO_DEFAULT_PIPELINE_RUNS: DemoDefaultPipelineRun[] = [
  {
    id: "demo-run-1",
    status: "completed",
    startedOffsetMinutes: 140,
    completedOffsetMinutes: 120,
    jobsDiscovered: 14,
    jobsProcessed: 6,
  },
  {
    id: "demo-run-2",
    status: "completed",
    startedOffsetMinutes: 45,
    completedOffsetMinutes: 30,
    jobsDiscovered: 9,
    jobsProcessed: 4,
  },
];

export interface DemoDefaultJob {
  id: string;
  source: JobSource;
  title: string;
  employer: string;
  jobUrl: string;
  applicationLink: string;
  location: string;
  salary: string;
  deadline: string;
  status: JobStatus;
  discoveredOffsetMinutes: number;
  suitabilityScore: number;
  suitabilityReason: string;
  tailoredSummary?: string;
  tailoredHeadline?: string;
  tailoredSkills?: string[];
  selectedProjectIds?: string;
  pdfPath?: string;
  notionPageId?: string;
  appliedOffsetMinutes?: number;
}

export const DEMO_DEFAULT_JOBS: DemoDefaultJob[] = [
  {
    id: "demo-job-ready-1",
    source: "linkedin",
    title: "Software Engineer (Platform)",
    employer: "NovaStack",
    jobUrl: "https://demo.job-ops.local/jobs/novastack-platform",
    applicationLink: "https://demo.job-ops.local/apply/novastack-platform",
    location: "Remote (US)",
    salary: "$130,000 - $155,000",
    deadline: "2026-03-15",
    status: "ready",
    discoveredOffsetMinutes: 240,
    suitabilityScore: 84,
    suitabilityReason: "Demo seed score 84 for Software Engineer (Platform).",
    tailoredSummary:
      "Demo tailored summary for Software Engineer (Platform) at NovaStack.",
    tailoredHeadline: "Demo headline - Software Engineer (Platform)",
    tailoredSkills: ["TypeScript", "Node.js", "System Design"],
    selectedProjectIds: "demo-project-1,demo-project-2",
    pdfPath: "/pdfs/demo-job-ready-1.pdf",
  },
  {
    id: "demo-job-discovered-1",
    source: "indeed",
    title: "Backend Engineer",
    employer: "Acme Data Systems",
    jobUrl: "https://demo.job-ops.local/jobs/acme-backend",
    applicationLink: "https://demo.job-ops.local/apply/acme-backend",
    location: "Austin, TX",
    salary: "$120,000 - $145,000",
    deadline: "2026-03-10",
    status: "discovered",
    discoveredOffsetMinutes: 90,
    suitabilityScore: 72,
    suitabilityReason: "Demo seed score 72 for Backend Engineer.",
  },
  {
    id: "demo-job-discovered-2",
    source: "gradcracker",
    title: "Graduate Software Developer",
    employer: "Orbital Labs",
    jobUrl: "https://demo.job-ops.local/jobs/orbital-grad",
    applicationLink: "https://demo.job-ops.local/apply/orbital-grad",
    location: "London, UK",
    salary: "GBP 42,000",
    deadline: "2026-03-20",
    status: "discovered",
    discoveredOffsetMinutes: 60,
    suitabilityScore: 74,
    suitabilityReason: "Demo seed score 74 for Graduate Software Developer.",
  },
  {
    id: "demo-job-applied-1",
    source: "manual",
    title: "Senior TypeScript Engineer",
    employer: "BrightScale",
    jobUrl: "https://demo.job-ops.local/jobs/brightscale-senior",
    applicationLink: "https://demo.job-ops.local/apply/brightscale-senior",
    location: "New York, NY",
    salary: "$155,000 - $180,000",
    deadline: "2026-03-08",
    status: "applied",
    discoveredOffsetMinutes: 360,
    appliedOffsetMinutes: 180,
    suitabilityScore: 88,
    suitabilityReason: "Demo seed score 88 for Senior TypeScript Engineer.",
    tailoredSummary:
      "Demo tailored summary for Senior TypeScript Engineer at BrightScale.",
    tailoredHeadline: "Demo headline - Senior TypeScript Engineer",
    tailoredSkills: ["TypeScript", "Architecture", "Mentorship"],
    selectedProjectIds: "demo-project-1,demo-project-2",
    pdfPath: "/pdfs/demo-job-applied-1.pdf",
    notionPageId: "demo-notion-applied-1",
  },
  {
    id: "demo-job-skipped-1",
    source: "ukvisajobs",
    title: "Full Stack Engineer",
    employer: "Cloudbridge",
    jobUrl: "https://demo.job-ops.local/jobs/cloudbridge-fullstack",
    applicationLink: "https://demo.job-ops.local/apply/cloudbridge-fullstack",
    location: "Manchester, UK",
    salary: "GBP 55,000",
    deadline: "2026-03-02",
    status: "skipped",
    discoveredOffsetMinutes: 480,
    suitabilityScore: 64,
    suitabilityReason: "Demo seed score 64 for Full Stack Engineer.",
  },
];

export interface DemoDefaultStageEvent {
  id: string;
  applicationId: string;
  fromStage: "applied" | null;
  toStage: "applied";
  title: string;
  occurredOffsetMinutes: number;
  metadata: StageEventMetadata | null;
}

export const DEMO_DEFAULT_STAGE_EVENTS: DemoDefaultStageEvent[] = [
  {
    id: "demo-event-applied-1",
    applicationId: "demo-job-applied-1",
    fromStage: null,
    toStage: "applied",
    title: "Applied (seeded demo)",
    occurredOffsetMinutes: 180,
    metadata: { eventLabel: "Applied (seeded demo)", actor: "system" },
  },
];
