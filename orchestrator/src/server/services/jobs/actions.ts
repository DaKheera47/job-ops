import { AppError, type AppErrorCode, badRequest } from "@infra/errors";
import { isDemoMode } from "@server/config/demo";
import { processJob } from "@server/pipeline/index";
import * as jobsRepo from "@server/repositories/jobs";
import {
  simulateProcessJob,
  simulateRescoreJob,
} from "@server/services/demo-simulator";
import { getProfile } from "@server/services/profile";
import { scoreJobSuitability } from "@server/services/scorer";
import type { JobAction, JobActionResult, JobStatus } from "@shared/types";

const SKIPPABLE_STATUSES: ReadonlySet<JobStatus> = new Set([
  "discovered",
  "ready",
]);

function mapErrorForResult(error: unknown): {
  code: string;
  message: string;
  details?: unknown;
} {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    };
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message || "Unknown error",
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Unknown error",
  };
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

export type JobActionExecutionOptions = {
  getProfileForRescore?: () => Promise<Record<string, unknown>>;
  forceMoveToReady?: boolean;
  requestOrigin?: string | null;
  analyticsOrigin?:
    | "move_to_ready"
    | "generate_pdf"
    | "pipeline"
    | "manual_job_create";
};

export function createSharedRescoreProfileLoader(): () => Promise<
  Record<string, unknown>
> {
  let profilePromise: Promise<Record<string, unknown>> | null = null;

  return async () => {
    if (!profilePromise) {
      profilePromise = (async () => {
        const rawProfile = await getProfile();
        if (
          !rawProfile ||
          typeof rawProfile !== "object" ||
          Array.isArray(rawProfile)
        ) {
          throw badRequest("Invalid resume profile format");
        }
        return rawProfile as Record<string, unknown>;
      })();
    }
    return profilePromise;
  };
}

export async function executeJobActionForJob(
  action: JobAction,
  jobId: string,
  options?: JobActionExecutionOptions,
): Promise<JobActionResult> {
  try {
    const job = await jobsRepo.getJobById(jobId);
    if (!job) {
      throw new AppError({
        status: 404,
        code: "NOT_FOUND",
        message: "Job not found",
      });
    }

    if (action === "skip") {
      if (!SKIPPABLE_STATUSES.has(job.status)) {
        throw badRequest(`Job is not skippable from status "${job.status}"`, {
          jobId,
          status: job.status,
          allowedStatuses: ["discovered", "ready"],
        });
      }

      const updated = await jobsRepo.updateJob(jobId, { status: "skipped" });
      if (!updated) {
        throw new AppError({
          status: 404,
          code: "NOT_FOUND",
          message: "Job not found",
        });
      }

      return { jobId, ok: true, job: updated };
    }

    if (action === "move_to_ready") {
      if (job.status !== "discovered") {
        throw badRequest(
          `Job is not movable to Ready from status "${job.status}"`,
          {
            jobId,
            status: job.status,
            requiredStatus: "discovered",
          },
        );
      }

      if (isDemoMode()) {
        const simulated = await simulateProcessJob(jobId, {
          force: options?.forceMoveToReady ?? false,
        });
        if (!simulated.success) {
          throw new AppError({
            status: 500,
            code: "INTERNAL_ERROR",
            message: simulated.error || "Failed to process job",
          });
        }
      } else {
        const processed = await processJob(jobId, {
          force: options?.forceMoveToReady ?? false,
          requestOrigin: options?.requestOrigin ?? null,
          analyticsOrigin: options?.analyticsOrigin ?? "move_to_ready",
        });
        if (!processed.success) {
          throw new AppError({
            status: 500,
            code: "INTERNAL_ERROR",
            message: processed.error || "Failed to process job",
          });
        }
      }

      const updated = await jobsRepo.getJobById(jobId);
      if (!updated) {
        throw new AppError({
          status: 404,
          code: "NOT_FOUND",
          message: "Job not found after processing",
        });
      }

      return { jobId, ok: true, job: updated };
    }

    if (job.status === "processing") {
      throw badRequest(`Job is not rescorable from status "${job.status}"`, {
        jobId,
        status: job.status,
        disallowedStatus: "processing",
      });
    }

    if (isDemoMode()) {
      const simulated = await simulateRescoreJob(job.id);
      return { jobId, ok: true, job: simulated };
    }

    const profile = options?.getProfileForRescore
      ? await options.getProfileForRescore()
      : await (async () => {
          const rawProfile = await getProfile();
          if (
            !rawProfile ||
            typeof rawProfile !== "object" ||
            Array.isArray(rawProfile)
          ) {
            throw badRequest("Invalid resume profile format");
          }
          return rawProfile as Record<string, unknown>;
        })();

    const { score, reason } = await scoreJobSuitability(job, profile);

    const updated = await jobsRepo.updateJob(job.id, {
      suitabilityScore: score,
      suitabilityReason: reason,
    });
    if (!updated) {
      throw new AppError({
        status: 404,
        code: "NOT_FOUND",
        message: "Job not found",
      });
    }

    return { jobId, ok: true, job: updated };
  } catch (error) {
    const mapped = mapErrorForResult(error);
    return {
      jobId,
      ok: false,
      error: {
        code: mapped.code,
        message: mapped.message,
      },
    };
  }
}

export function mapJobActionFailure(
  failure: Extract<JobActionResult, { ok: false }>,
): AppError {
  const code = (
    failure.error.code in STATUS_BY_APP_ERROR_CODE
      ? failure.error.code
      : "INTERNAL_ERROR"
  ) as AppErrorCode;

  return new AppError({
    status: STATUS_BY_APP_ERROR_CODE[code],
    code,
    message: failure.error.message,
  });
}
