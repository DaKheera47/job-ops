import { logger } from "@infra/logger";
import * as pipeline from "@server/pipeline/index";
import * as jobsRepo from "@server/repositories/jobs";
import * as pipelineRepo from "@server/repositories/pipeline";
import { transitionStage } from "@server/services/applicationTracking";
import type {
  Job,
  JobSource,
  PipelineConfig,
  StageEventMetadata,
} from "@shared/types";

type ProcessOptions = {
  force?: boolean;
};

function scoreFromJob(job: Job): number {
  const seed = `${job.id}:${job.title}:${job.employer}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100000;
  }
  return 55 + (hash % 40);
}

function makeDemoReason(job: Job, score: number): string {
  return `Demo score ${score}: simulated match for ${job.title} at ${job.employer}.`;
}

function makeDemoSummary(job: Job): string {
  return `Demo summary for ${job.title} at ${job.employer}. This text is simulated in demo mode and does not call a live LLM provider.`;
}

function ensureProjectIds(job: Job): string {
  if (job.selectedProjectIds?.trim()) return job.selectedProjectIds;
  return "demo-project-1,demo-project-2";
}

function samplePdfPath(job: Job): string {
  const safeId = job.id.replace(/[^a-zA-Z0-9-_]/g, "");
  return `/pdfs/demo-${safeId || "sample"}.pdf`;
}

async function ensureJob(jobId: string): Promise<Job> {
  const job = await jobsRepo.getJobById(jobId);
  if (!job) throw new Error("Job not found");
  return job;
}

export async function simulatePipelineRun(
  config?: Partial<PipelineConfig>,
): Promise<{ message: string; runId: string; jobsDiscovered: number }> {
  const run = await pipelineRepo.createPipelineRun();
  const source = config?.sources?.[0] ?? "manual";
  const now = new Date();
  const isoNow = now.toISOString();
  const jobUrl = `https://demo.job-ops.local/jobs/${run.id}`;
  await jobsRepo.createJob({
    source: source as JobSource,
    title: "Demo Software Engineer",
    employer: "Demo Systems Ltd",
    jobUrl,
    applicationLink: jobUrl,
    location: "Remote",
    salary: "Competitive",
    deadline: now.toISOString().slice(0, 10),
    jobDescription:
      "This is a generated demo job used to simulate pipeline behavior.",
  });

  await pipelineRepo.updatePipelineRun(run.id, {
    status: "completed",
    completedAt: isoNow,
    jobsDiscovered: 1,
    jobsProcessed: 0,
  });
  pipeline.progressHelpers.complete(1, 0);
  logger.info("Simulated demo pipeline run", { pipelineRunId: run.id });

  return {
    message: "Pipeline simulated in demo mode",
    runId: run.id,
    jobsDiscovered: 1,
  };
}

export async function simulateSummarizeJob(
  jobId: string,
  _options?: ProcessOptions,
): Promise<{ success: boolean; error?: string }> {
  const job = await ensureJob(jobId);
  await jobsRepo.updateJob(job.id, {
    tailoredSummary: makeDemoSummary(job),
    tailoredHeadline: `Demo Tailored Resume - ${job.title}`,
    tailoredSkills: JSON.stringify([
      "TypeScript",
      "System Design",
      "Communication",
    ]),
    selectedProjectIds: ensureProjectIds(job),
  });
  return { success: true };
}

export async function simulateGeneratePdf(
  jobId: string,
): Promise<{ success: boolean; error?: string }> {
  const job = await ensureJob(jobId);
  await jobsRepo.updateJob(job.id, {
    status: "ready",
    pdfPath: samplePdfPath(job),
  });
  return { success: true };
}

export async function simulateProcessJob(
  jobId: string,
  options?: ProcessOptions,
): Promise<{ success: boolean; error?: string }> {
  const summarize = await simulateSummarizeJob(jobId, options);
  if (!summarize.success) return summarize;
  return simulateGeneratePdf(jobId);
}

export async function simulateRescoreJob(jobId: string): Promise<Job> {
  const job = await ensureJob(jobId);
  const score = scoreFromJob(job);
  const updated = await jobsRepo.updateJob(job.id, {
    suitabilityScore: score,
    suitabilityReason: makeDemoReason(job, score),
  });
  if (!updated) throw new Error("Job not found");
  return updated;
}

export async function simulateApplyJob(jobId: string): Promise<Job> {
  const job = await ensureJob(jobId);
  const appliedAtDate = new Date();
  transitionStage(
    job.id,
    "applied",
    Math.floor(appliedAtDate.getTime() / 1000),
    {
      eventLabel: "Applied (Demo Simulation)",
      actor: "system",
      note: "This apply action was simulated in demo mode.",
    } satisfies StageEventMetadata,
    null,
  );

  const updated = await jobsRepo.updateJob(job.id, {
    status: "applied",
    appliedAt: appliedAtDate.toISOString(),
    notionPageId: `demo-notion-${job.id.slice(0, 8)}`,
  });
  if (!updated) throw new Error("Job not found");
  return updated;
}
