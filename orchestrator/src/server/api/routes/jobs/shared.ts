import { AppError, type AppErrorCode, badRequest } from "@infra/errors";
import { logger } from "@infra/logger";
import type * as jobsRepo from "@server/repositories/jobs";
import { stageEventMetadataSchema } from "@server/services/applicationTracking";
import {
  enqueueAutoPdfRegenerationForJob,
  shouldEnqueueTailoringAutoPdfRegeneration,
} from "@server/services/auto-pdf-regeneration";
import {
  applyJobPdfFreshness,
  type PdfFingerprintContext,
  resolvePdfFingerprintContext,
} from "@server/services/pdf-fingerprint";
import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  type Job,
  type JobListItem,
  type JobStatus,
} from "@shared/types";
import { z } from "zod";

export const JOB_ACTION_CONCURRENCY = 4;

const tailoredSkillsPayloadSchema = z.array(
  z.object({
    name: z.string(),
    keywords: z.array(z.string()),
  }),
);

export const jobNoteSchema = z.object({
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(20000),
});

export async function hydrateJobPdfFreshness<T extends Job>(
  job: T,
): Promise<T> {
  const context = await resolvePdfFingerprintContext();
  return applyJobPdfFreshness(job, context);
}

export function hydrateJobPdfFreshnessWithContext<T extends Job>(
  job: T,
  context: PdfFingerprintContext,
): T {
  return applyJobPdfFreshness(job, context);
}

export function toJobListItem(
  job: jobsRepo.JobListItemWithPdfFreshnessInput,
): JobListItem {
  return {
    id: job.id,
    source: job.source,
    title: job.title,
    employer: job.employer,
    jobUrl: job.jobUrl,
    applicationLink: job.applicationLink,
    datePosted: job.datePosted,
    deadline: job.deadline,
    salary: job.salary,
    location: job.location,
    status: job.status,
    outcome: job.outcome,
    closedAt: job.closedAt,
    suitabilityScore: job.suitabilityScore,
    sponsorMatchScore: job.sponsorMatchScore,
    jobType: job.jobType,
    jobFunction: job.jobFunction,
    pdfRegenerating: job.pdfRegenerating,
    pdfFreshness: job.pdfFreshness,
    salaryMinAmount: job.salaryMinAmount,
    salaryMaxAmount: job.salaryMaxAmount,
    salaryCurrency: job.salaryCurrency,
    discoveredAt: job.discoveredAt,
    readyAt: job.readyAt,
    appliedAt: job.appliedAt,
    updatedAt: job.updatedAt,
  };
}

export function queueTailoringAutoPdfRegenerationIfNeeded(
  previousJob: Job,
  nextJob: Job,
  route: string,
): void {
  if (!shouldEnqueueTailoringAutoPdfRegeneration(previousJob, nextJob)) {
    return;
  }

  queueMicrotask(() => {
    void enqueueAutoPdfRegenerationForJob({
      jobId: nextJob.id,
      reason: "tailoring_updated",
      requestedBy: "user",
    }).catch((error) => {
      logger.warn("Failed to queue auto PDF regeneration after job update", {
        route,
        jobId: nextJob.id,
        reason: "tailoring_updated",
        error,
      });
    });
  });
}

export const updateJobSchema = z.object({
  title: z.string().trim().min(1).max(500).optional(),
  employer: z.string().trim().min(1).max(500).optional(),
  jobUrl: z.string().trim().min(1).max(2000).url().optional(),
  applicationLink: z.string().trim().max(2000).url().nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  salary: z.string().trim().max(200).nullable().optional(),
  deadline: z.string().trim().max(100).nullable().optional(),
  status: z
    .enum([
      "discovered",
      "processing",
      "ready",
      "applied",
      "in_progress",
      "skipped",
      "expired",
    ])
    .optional(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable().optional(),
  closedAt: z.number().int().nullable().optional(),
  jobDescription: z.string().trim().max(40000).nullable().optional(),
  suitabilityScore: z.number().min(0).max(100).optional(),
  suitabilityReason: z.string().optional(),
  tailoredSummary: z.string().optional(),
  tailoredHeadline: z.string().optional(),
  tailoredSkills: z
    .string()
    .optional()
    .superRefine((value, ctx) => {
      if (value === undefined || value.trim().length === 0) return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "tailoredSkills must be a JSON array of { name, keywords } objects",
        });
        return;
      }

      const parseResult = tailoredSkillsPayloadSchema.safeParse(parsed);

      if (!parseResult.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "tailoredSkills must be a JSON array of { name, keywords } objects",
        });
      }
    }),
  selectedProjectIds: z.string().optional(),
  pdfPath: z.string().optional(),
  tracerLinksEnabled: z.boolean().optional(),
  sponsorMatchScore: z.number().min(0).max(100).optional(),
  sponsorMatchNames: z.string().optional(),
});

export function isJobUrlConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /UNIQUE constraint failed: .*jobs\.job_url/i.test(error.message);
}

export const transitionStageSchema = z.object({
  toStage: z.enum([...APPLICATION_STAGES, "no_change"]),
  occurredAt: z.number().int().nullable().optional(),
  metadata: stageEventMetadataSchema.nullable().optional(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable().optional(),
});

export const updateStageEventSchema = z.object({
  toStage: z.enum(APPLICATION_STAGES).optional(),
  occurredAt: z.number().int().optional(),
  metadata: stageEventMetadataSchema.nullable().optional(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable().optional(),
});

export const updateOutcomeSchema = z.object({
  outcome: z.enum(APPLICATION_OUTCOMES).nullable(),
  closedAt: z.number().int().nullable().optional(),
});

export const jobActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("skip"),
    jobIds: z.array(z.string().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal("rescore"),
    jobIds: z.array(z.string().min(1)).min(1).max(100),
  }),
  z.object({
    action: z.literal("move_to_ready"),
    jobIds: z.array(z.string().min(1)).min(1).max(100),
    options: z
      .object({
        force: z.boolean().optional(),
      })
      .optional(),
  }),
]);

export const listJobsQuerySchema = z.object({
  status: z.string().optional(),
  view: z.enum(["full", "list"]).optional(),
});

export const jobsRevisionQuerySchema = z.object({
  status: z.string().optional(),
});

export const uploadJobPdfSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mediaType: z.string().trim().min(1).max(200).optional(),
  dataBase64: z.string().trim().min(1),
});

export const JOBS_BENCHMARK_ENABLED =
  process.env.BENCHMARK_JOBS_TIMING === "1" ||
  process.env.BENCHMARK_JOBS_TIMING === "true";

export function parseStatusFilter(
  statusFilter?: string,
): JobStatus[] | undefined {
  const parsed = statusFilter?.split(",").filter(Boolean) as
    | JobStatus[]
    | undefined;
  return parsed && parsed.length > 0 ? parsed : undefined;
}

const STATUS_BY_APP_ERROR_CODE: Record<AppErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  REQUEST_TIMEOUT: 408,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  SERVICE_UNAVAILABLE: 503,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
};

export function appErrorFromPipelineFailure(
  result: { error?: string; errorCode?: AppErrorCode },
  fallbackMessage: string,
): AppError {
  const code =
    result.errorCode ?? (result.error === "Job not found" ? "NOT_FOUND" : null);

  if (!code) {
    return badRequest(result.error ?? fallbackMessage);
  }

  return new AppError({
    status: STATUS_BY_APP_ERROR_CODE[code],
    code,
    message: result.error ?? fallbackMessage,
  });
}
