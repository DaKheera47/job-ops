import {
  AppError,
  type AppErrorCode,
  badRequest,
  conflict,
  notFound,
} from "@infra/errors";
import { fail, ok, okWithMeta } from "@infra/http";
import { logger } from "@infra/logger";
import { sanitizeWebhookPayload } from "@infra/sanitize";
import { setupSse, startSseHeartbeat, writeSseData } from "@infra/sse";
import {
  APPLICATION_OUTCOMES,
  APPLICATION_STAGES,
  type Job,
  type JobAction,
  type JobActionResponse,
  type JobActionResult,
  type JobActionStreamEvent,
  type JobListItem,
  type JobStatus,
  type JobsListResponse,
  type JobsRevisionResponse,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { isDemoMode, sendDemoBlocked } from "../../config/demo";
import {
  generateFinalPdf,
  processJob,
  summarizeJob,
} from "../../pipeline/index";
import * as jobsRepo from "../../repositories/jobs";
import * as settingsRepo from "../../repositories/settings";
import {
  deleteStageEvent,
  getStageEvents,
  getTasks,
  stageEventMetadataSchema,
  transitionStage,
  updateStageEvent,
} from "../../services/applicationTracking";
import {
  simulateApplyJob,
  simulateGeneratePdf,
  simulateProcessJob,
  simulateRescoreJob,
  simulateSummarizeJob,
} from "../../services/demo-simulator";
import { getProfile } from "../../services/profile";
import { scoreJobSuitability } from "../../services/scorer";
import { getTracerReadiness } from "../../services/tracer-links";
import * as visaSponsors from "../../services/visa-sponsors/index";
import { asyncPool } from "../../utils/async-pool";

export const jobsRouter = Router();
const JOB_ACTION_CONCURRENCY = 4;

const tailoredSkillsPayloadSchema = z.array(
  z.object({
    name: z.string(),
    keywords: z.array(z.string()),
  }),
);

async function notifyJobCompleteWebhook(job: Job) {
  const overrideWebhookUrl = await settingsRepo.getSetting(
    "jobCompleteWebhookUrl",
  );
  const webhookUrl = (
    overrideWebhookUrl ||
    process.env.JOB_COMPLETE_WEBHOOK_URL ||
    ""
  ).trim();
  if (!webhookUrl) return;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const secret = process.env.WEBHOOK_SECRET;
    if (secret) headers.Authorization = `Bearer ${secret}`;

    const payload = sanitizeWebhookPayload({
      event: "job.completed",
      sentAt: new Date().toISOString(),
      job: {
        id: job.id,
        source: job.source,
        title: job.title,
        employer: job.employer,
        status: job.status,
        suitabilityScore: job.suitabilityScore,
        sponsorMatchScore: job.sponsorMatchScore,
      },
    });

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.warn("Job complete webhook POST failed", {
        status: response.status,
        response: (await response.text().catch(() => "")).slice(0, 200),
        jobId: job.id,
      });
    }
  } catch (error) {
    logger.warn("Job complete webhook POST failed", { jobId: job.id, error });
  }
}

/**
 * PATCH /api/jobs/:id - Update a job
 */
const updateJobSchema = z.object({
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

function isJobUrlConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /UNIQUE constraint failed: jobs\.job_url/i.test(error.message);
}

const transitionStageSchema = z.object({
  toStage: z.enum([...APPLICATION_STAGES, "no_change"]),
  occurredAt: z.number().int().nullable().optional(),
  metadata: stageEventMetadataSchema.nullable().optional(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable().optional(),
});

const updateStageEventSchema = z.object({
  toStage: z.enum(APPLICATION_STAGES).optional(),
  occurredAt: z.number().int().optional(),
  metadata: stageEventMetadataSchema.nullable().optional(),
  outcome: z.enum(APPLICATION_OUTCOMES).nullable().optional(),
});

const updateOutcomeSchema = z.object({
  outcome: z.enum(APPLICATION_OUTCOMES).nullable(),
  closedAt: z.number().int().nullable().optional(),
});

const jobActionRequestSchema = z.discriminatedUnion("action", [
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

const listJobsQuerySchema = z.object({
  status: z.string().optional(),
  view: z.enum(["full", "list"]).optional(),
});

const jobsRevisionQuerySchema = z.object({
  status: z.string().optional(),
});

const SKIPPABLE_STATUSES: ReadonlySet<JobStatus> = new Set([
  "discovered",
  "ready",
]);

function parseStatusFilter(statusFilter?: string): JobStatus[] | undefined {
  const parsed = statusFilter?.split(",").filter(Boolean) as
    | JobStatus[]
    | undefined;
  return parsed && parsed.length > 0 ? parsed : undefined;
}

function resolveRequestOrigin(req: Request): string | null {
  const configuredBaseUrl = process.env.JOBOPS_PUBLIC_BASE_URL?.trim();
  if (configuredBaseUrl) {
    try {
      const parsed = new URL(configuredBaseUrl);
      if (parsed.protocol && parsed.host) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // Ignore invalid env and fall back to request-derived origin.
    }
  }

  const trustProxy = Boolean(req.app?.get("trust proxy"));
  let protocol = (req.protocol || "").trim();
  let host = (req.header("host") || "").trim();

  if (trustProxy) {
    const forwardedProto =
      req.header("x-forwarded-proto")?.split(",")[0]?.trim() ?? "";
    const forwardedHost =
      req.header("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
    if (forwardedProto) protocol = forwardedProto;
    if (forwardedHost) host = forwardedHost;
  }

  if (!host || !protocol) return null;
  return `${protocol}://${host}`;
}

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

type JobActionExecutionOptions = {
  getProfileForRescore?: () => Promise<Record<string, unknown>>;
  forceMoveToReady?: boolean;
  requestOrigin?: string | null;
};

function createSharedRescoreProfileLoader(): () => Promise<
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

async function executeJobActionForJob(
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

function mapJobActionFailure(
  failure: Extract<JobActionResult, { ok: false }>,
): AppError {
  const statusByCode: Record<AppErrorCode, number> = {
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
  const code = (
    failure.error.code in statusByCode ? failure.error.code : "INTERNAL_ERROR"
  ) as AppErrorCode;

  return new AppError({
    status: statusByCode[code],
    code,
    message: failure.error.message,
  });
}

/**
 * GET /api/jobs - List all jobs
 * Query params: status (comma-separated list of statuses to filter)
 */
jobsRouter.get("/", async (req: Request, res: Response) => {
  try {
    const parsedQuery = listJobsQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return fail(
        res,
        badRequest(
          "Invalid jobs list query parameters",
          parsedQuery.error.flatten(),
        ),
      );
    }

    const statusFilter = parsedQuery.data.status;
    const statuses = parseStatusFilter(statusFilter);
    const view = parsedQuery.data.view ?? "list";

    const jobs: Array<Job | JobListItem> =
      view === "list"
        ? await jobsRepo.getJobListItems(statuses)
        : await jobsRepo.getAllJobs(statuses);
    const stats = await jobsRepo.getJobStats();
    const revision = await jobsRepo.getJobsRevision(statuses);

    const response: JobsListResponse<Job | JobListItem> = {
      jobs,
      total: jobs.length,
      byStatus: stats,
      revision: revision.revision,
    };

    logger.info("Jobs list fetched", {
      route: "GET /api/jobs",
      view,
      statusFilter: statusFilter ?? null,
      revision: revision.revision,
      returnedCount: jobs.length,
    });

    ok(res, response);
  } catch (error) {
    const err =
      error instanceof AppError
        ? error
        : new AppError({
            status: 500,
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          });
    fail(res, err);
  }
});

/**
 * GET /api/jobs/revision - Get jobs list revision for lightweight change detection
 * Query params: status (comma-separated list of statuses to filter)
 */
jobsRouter.get("/revision", async (req: Request, res: Response) => {
  try {
    const parsedQuery = jobsRevisionQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return fail(
        res,
        badRequest(
          "Invalid jobs revision query parameters",
          parsedQuery.error.flatten(),
        ),
      );
    }

    const statuses = parseStatusFilter(parsedQuery.data.status);
    const revision = await jobsRepo.getJobsRevision(statuses);

    const response: JobsRevisionResponse = {
      revision: revision.revision,
      latestUpdatedAt: revision.latestUpdatedAt,
      total: revision.total,
      statusFilter: revision.statusFilter,
    };

    logger.info("Jobs revision fetched", {
      route: "GET /api/jobs/revision",
      statusFilter: revision.statusFilter,
      revision: revision.revision,
      total: revision.total,
    });

    ok(res, response);
  } catch (error) {
    const err =
      error instanceof AppError
        ? error
        : new AppError({
            status: 500,
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          });
    fail(res, err);
  }
});

/**
 * POST /api/jobs/actions - Run a job action across selected jobs
 */
jobsRouter.post("/actions", async (req: Request, res: Response) => {
  try {
    const parsed = jobActionRequestSchema.parse(req.body);
    const dedupedJobIds = Array.from(new Set(parsed.jobIds));
    const requestOrigin = resolveRequestOrigin(req);
    const executionOptions: JobActionExecutionOptions = {
      ...(parsed.action === "rescore" && !isDemoMode()
        ? { getProfileForRescore: createSharedRescoreProfileLoader() }
        : {}),
      ...(parsed.action === "move_to_ready" &&
      parsed.options?.force !== undefined
        ? { forceMoveToReady: parsed.options.force }
        : {}),
      ...(parsed.action === "move_to_ready" ? { requestOrigin } : {}),
    };

    const results = await asyncPool({
      items: dedupedJobIds,
      concurrency: JOB_ACTION_CONCURRENCY,
      task: async (jobId) =>
        executeJobActionForJob(parsed.action, jobId, executionOptions),
    });

    const succeeded = results.filter((result) => result.ok).length;
    const failed = results.length - succeeded;
    const payload: JobActionResponse = {
      action: parsed.action,
      requested: dedupedJobIds.length,
      succeeded,
      failed,
      results,
    };

    logger.info("Job action completed", {
      route: "POST /api/jobs/actions",
      action: parsed.action,
      requested: dedupedJobIds.length,
      succeeded,
      failed,
      concurrency: JOB_ACTION_CONCURRENCY,
    });

    ok(res, payload);
  } catch (error) {
    const err =
      error instanceof z.ZodError
        ? badRequest("Invalid job action request", error.flatten())
        : error instanceof AppError
          ? error
          : new AppError({
              status: 500,
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : "Unknown error",
            });

    logger.error("Job action failed", {
      route: "POST /api/jobs/actions",
      status: err.status,
      code: err.code,
      details: err.details,
    });

    fail(res, err);
  }
});

/**
 * POST /api/jobs/actions/stream - Run a job action and stream per-job progress via SSE
 */
jobsRouter.post("/actions/stream", async (req: Request, res: Response) => {
  const parsed = jobActionRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return fail(
      res,
      badRequest("Invalid job action request", parsed.error.flatten()),
    );
  }

  const dedupedJobIds = Array.from(new Set(parsed.data.jobIds));
  const requestOrigin = resolveRequestOrigin(req);
  const requestId = String(res.getHeader("x-request-id") || "unknown");
  const action = parsed.data.action;
  const executionOptions: JobActionExecutionOptions = {
    ...(action === "rescore" && !isDemoMode()
      ? { getProfileForRescore: createSharedRescoreProfileLoader() }
      : {}),
    ...(action === "move_to_ready" && parsed.data.options?.force !== undefined
      ? { forceMoveToReady: parsed.data.options.force }
      : {}),
    ...(action === "move_to_ready" ? { requestOrigin } : {}),
  };
  const requested = dedupedJobIds.length;
  const results: JobActionResult[] = [];
  let succeeded = 0;
  let failed = 0;

  setupSse(res, {
    cacheControl: "no-cache, no-transform",
    disableBuffering: true,
    flushHeaders: true,
  });
  const stopHeartbeat = startSseHeartbeat(res);

  let clientDisconnected = false;
  res.on("close", () => {
    clientDisconnected = true;
    stopHeartbeat();
  });

  const isResponseWritable = () =>
    !clientDisconnected && !res.writableEnded && !res.destroyed;

  const sendEvent = (event: JobActionStreamEvent) => {
    if (!isResponseWritable()) return false;
    writeSseData(res, event);
    return true;
  };

  try {
    if (
      !sendEvent({
        type: "started",
        action,
        requested,
        completed: 0,
        succeeded: 0,
        failed: 0,
        requestId,
      })
    ) {
      logger.info("Client disconnected before action stream started", {
        route: "POST /api/jobs/actions/stream",
        action,
        requested,
        succeeded,
        failed,
        requestId,
      });
      return;
    }

    await asyncPool({
      items: dedupedJobIds,
      concurrency: JOB_ACTION_CONCURRENCY,
      shouldStop: () => !isResponseWritable(),
      task: async (jobId) => {
        if (!isResponseWritable()) return;

        const result = await executeJobActionForJob(
          action,
          jobId,
          executionOptions,
        );
        results.push(result);
        if (result.ok) succeeded += 1;
        else failed += 1;

        if (
          !sendEvent({
            type: "progress",
            action,
            requested,
            completed: results.length,
            succeeded,
            failed,
            result,
            requestId,
          })
        ) {
          logger.info(
            "Client disconnected while writing action stream progress",
            {
              route: "POST /api/jobs/actions/stream",
              action,
              requested,
              succeeded,
              failed,
              requestId,
            },
          );
        }
      },
    });

    sendEvent({
      type: "completed",
      action,
      requested,
      completed: results.length,
      succeeded,
      failed,
      results,
      requestId,
    });

    logger.info("Job action stream completed", {
      route: "POST /api/jobs/actions/stream",
      action,
      requested,
      succeeded,
      failed,
      concurrency: JOB_ACTION_CONCURRENCY,
      requestId,
    });
  } catch (error) {
    const err =
      error instanceof AppError
        ? error
        : new AppError({
            status: 500,
            code: "INTERNAL_ERROR",
            message: error instanceof Error ? error.message : "Unknown error",
          });

    logger.error("Job action stream failed", {
      route: "POST /api/jobs/actions/stream",
      action,
      requested,
      succeeded,
      failed,
      status: err.status,
      code: err.code,
      requestId,
    });

    if (
      !sendEvent({
        type: "error",
        code: err.code,
        message: err.message,
        requestId,
      })
    ) {
      logger.info("Skipping stream error event because client disconnected", {
        route: "POST /api/jobs/actions/stream",
        action,
        requested,
        succeeded,
        failed,
        requestId,
      });
    }
  } finally {
    stopHeartbeat();
    if (!res.writableEnded && !res.destroyed) {
      res.end();
    }
  }
});

jobsRouter.post("/:id/process", async (req: Request, res: Response) => {
  const forceRaw = req.query.force as string | undefined;
  const force = forceRaw === "1" || forceRaw === "true";
  const result = await executeJobActionForJob("move_to_ready", req.params.id, {
    forceMoveToReady: force,
    requestOrigin: resolveRequestOrigin(req),
  });
  if (!result.ok) return fail(res, mapJobActionFailure(result));
  ok(res, result.job);
});

jobsRouter.post("/:id/skip", async (req: Request, res: Response) => {
  const result = await executeJobActionForJob("skip", req.params.id);
  if (!result.ok) return fail(res, mapJobActionFailure(result));
  ok(res, result.job);
});

jobsRouter.post("/:id/rescore", async (req: Request, res: Response) => {
  const result = await executeJobActionForJob("rescore", req.params.id, {
    ...(isDemoMode()
      ? {}
      : { getProfileForRescore: createSharedRescoreProfileLoader() }),
  });
  if (!result.ok) return fail(res, mapJobActionFailure(result));
  ok(res, result.job);
});

/**
 * GET /api/jobs/:id - Get a single job
 */
jobsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.getJobById(req.params.id);
    if (!job) {
      return fail(res, notFound("Job not found"));
    }
    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/jobs/:id/events - Get stage event timeline
 */
jobsRouter.get("/:id/events", async (req: Request, res: Response) => {
  try {
    const events = await getStageEvents(req.params.id);
    res.json({ success: true, data: events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/jobs/:id/tasks - Get tasks for an application
 */
jobsRouter.get("/:id/tasks", async (req: Request, res: Response) => {
  try {
    const includeCompleted =
      req.query.includeCompleted === "1" ||
      req.query.includeCompleted === "true";
    const tasks = await getTasks(req.params.id, includeCompleted);
    res.json({ success: true, data: tasks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/stages - Transition stage
 */
jobsRouter.post("/:id/stages", async (req: Request, res: Response) => {
  try {
    const input = transitionStageSchema.parse(req.body);
    const event = transitionStage(
      req.params.id,
      input.toStage,
      input.occurredAt ?? undefined,
      input.metadata ?? null,
      input.outcome ?? null,
    );
    res.json({ success: true, data: event });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * PATCH /api/jobs/:id/events/:eventId - Update an event
 */
jobsRouter.patch(
  "/:id/events/:eventId",
  async (req: Request, res: Response) => {
    try {
      const input = updateStageEventSchema.parse(req.body);
      updateStageEvent(req.params.eventId, input);
      res.json({ success: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ success: false, error: error.message });
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  },
);

/**
 * DELETE /api/jobs/:id/events/:eventId - Delete an event
 */
jobsRouter.delete(
  "/:id/events/:eventId",
  async (req: Request, res: Response) => {
    try {
      deleteStageEvent(req.params.eventId);
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  },
);

/**
 * PATCH /api/jobs/:id/outcome - Close out application
 */
jobsRouter.patch("/:id/outcome", async (req: Request, res: Response) => {
  try {
    const input = updateOutcomeSchema.parse(req.body);
    const closedAt = input.outcome
      ? (input.closedAt ?? Math.floor(Date.now() / 1000))
      : null;
    const job = await jobsRepo.updateJob(req.params.id, {
      outcome: input.outcome,
      closedAt,
    });

    if (!job) {
      return fail(res, notFound("Job not found"));
    }

    res.json({ success: true, data: job });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

jobsRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const input = updateJobSchema.parse(req.body);
    const currentJob = await jobsRepo.getJobById(req.params.id);

    if (!currentJob) {
      const err = new AppError({
        status: 404,
        code: "NOT_FOUND",
        message: "Job not found",
      });
      logger.warn("Job update failed", {
        route: "PATCH /api/jobs/:id",
        jobId: req.params.id,
        status: err.status,
        code: err.code,
      });
      fail(res, err);
      return;
    }

    const isTurningTracerLinksOn =
      input.tracerLinksEnabled === true && !currentJob.tracerLinksEnabled;

    if (isTurningTracerLinksOn) {
      const readiness = await getTracerReadiness({
        requestOrigin: resolveRequestOrigin(req),
        force: true,
      });

      if (!readiness.canEnable) {
        throw new AppError({
          status: 409,
          code: "CONFLICT",
          message:
            readiness.reason ??
            "Tracer links are unavailable right now. Verify Tracer Links in Settings.",
          details: {
            tracerReadiness: {
              status: readiness.status,
              checkedAt: readiness.checkedAt,
              publicBaseUrl: readiness.publicBaseUrl,
            },
          },
        });
      }
    }

    const job = await jobsRepo.updateJob(req.params.id, input);

    if (!job) {
      const err = new AppError({
        status: 404,
        code: "NOT_FOUND",
        message: "Job not found",
      });
      logger.warn("Job update failed", {
        route: "PATCH /api/jobs/:id",
        jobId: req.params.id,
        status: err.status,
        code: err.code,
      });
      return fail(res, err);
    }

    logger.info("Job updated", {
      route: "PATCH /api/jobs/:id",
      jobId: req.params.id,
      updatedFields: Object.keys(input),
    });

    ok(res, job);
  } catch (error) {
    const err =
      error instanceof z.ZodError
        ? badRequest(
            error.issues[0]?.message ?? "Invalid job update request",
            error.flatten(),
          )
        : isJobUrlConflictError(error)
          ? conflict("Another job already uses that job URL")
          : error instanceof AppError
            ? error
            : new AppError({
                status: 500,
                code: "INTERNAL_ERROR",
                message:
                  error instanceof Error ? error.message : "Unknown error",
              });

    logger.error("Job update failed", {
      route: "PATCH /api/jobs/:id",
      jobId: req.params.id,
      status: err.status,
      code: err.code,
      details: err.details,
    });

    fail(res, err);
  }
});

/**
 * POST /api/jobs/:id/summarize - Generate AI summary and suggest projects
 */
jobsRouter.post("/:id/summarize", async (req: Request, res: Response) => {
  try {
    const forceRaw = req.query.force as string | undefined;
    const force = forceRaw === "1" || forceRaw === "true";

    if (isDemoMode()) {
      const result = await simulateSummarizeJob(req.params.id, { force });
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      const job = await jobsRepo.getJobById(req.params.id);
      if (!job) {
        return fail(res, notFound("Job not found"));
      }
      return okWithMeta(res, job, { simulated: true });
    }

    const result = await summarizeJob(req.params.id, { force });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const job = await jobsRepo.getJobById(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/check-sponsor - Check if employer is a visa sponsor
 */
jobsRouter.post("/:id/check-sponsor", async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.getJobById(req.params.id);

    if (!job) {
      return fail(res, notFound("Job not found"));
    }

    if (!job.employer) {
      return res
        .status(400)
        .json({ success: false, error: "Job has no employer name" });
    }

    // Search for sponsor matches
    const sponsorResults = visaSponsors.searchSponsors(job.employer, {
      limit: 10,
      minScore: 50,
    });

    const { sponsorMatchScore, sponsorMatchNames } =
      visaSponsors.calculateSponsorMatchSummary(sponsorResults);

    // Update job with sponsor match info
    const updatedJob = await jobsRepo.updateJob(job.id, {
      sponsorMatchScore: sponsorMatchScore,
      sponsorMatchNames: sponsorMatchNames ?? undefined,
    });

    res.json({
      success: true,
      data: updatedJob,
      matchResults: sponsorResults.slice(0, 5).map((r) => ({
        name: r.sponsor.organisationName,
        score: r.score,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/generate-pdf - Generate PDF using current manual overrides
 */
jobsRouter.post("/:id/generate-pdf", async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      const result = await simulateGeneratePdf(req.params.id);
      if (!result.success) {
        return res.status(400).json({ success: false, error: result.error });
      }
      const job = await jobsRepo.getJobById(req.params.id);
      if (!job) {
        return fail(res, notFound("Job not found"));
      }
      return okWithMeta(res, job, { simulated: true });
    }

    const result = await generateFinalPdf(req.params.id, {
      requestOrigin: resolveRequestOrigin(req),
    });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const job = await jobsRepo.getJobById(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/apply - Mark a job as applied
 */
jobsRouter.post("/:id/apply", async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      const updatedJob = await simulateApplyJob(req.params.id);
      return okWithMeta(res, updatedJob, { simulated: true });
    }

    const job = await jobsRepo.getJobById(req.params.id);

    if (!job) {
      return fail(res, notFound("Job not found"));
    }

    const appliedAtDate = new Date();
    const appliedAt = appliedAtDate.toISOString();

    transitionStage(
      job.id,
      "applied",
      Math.floor(appliedAtDate.getTime() / 1000),
      {
        eventLabel: "Applied",
        actor: "system",
      },
      null,
    );

    const updatedJob = await jobsRepo.updateJob(job.id, {
      status: "applied",
      appliedAt,
    });

    if (updatedJob) {
      notifyJobCompleteWebhook(updatedJob).catch((error) => {
        logger.warn("Job complete webhook dispatch failed", error);
      });
    }

    if (!updatedJob) {
      return fail(res, notFound("Job not found"));
    }

    res.json({ success: true, data: updatedJob });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/jobs/status/:status - Clear jobs with a specific status
 */
jobsRouter.delete("/status/:status", async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Clearing jobs by status is disabled to keep the demo stable.",
        { route: "DELETE /api/jobs/status/:status", status: req.params.status },
      );
    }

    const status = req.params.status as JobStatus;
    const count = await jobsRepo.deleteJobsByStatus(status);

    res.json({
      success: true,
      data: {
        message: `Cleared ${count} ${status} jobs`,
        count,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/jobs/score/:threshold - Clear jobs with score below threshold (excluding post-apply statuses)
 */
jobsRouter.delete("/score/:threshold", async (req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Clearing jobs by score is disabled to keep the demo stable.",
        {
          route: "DELETE /api/jobs/score/:threshold",
          threshold: req.params.threshold,
        },
      );
    }

    const threshold = parseInt(req.params.threshold, 10);
    if (Number.isNaN(threshold) || threshold < 0 || threshold > 100) {
      return res.status(400).json({
        ok: false,
        error: {
          code: "INVALID_REQUEST",
          message: "Threshold must be a number between 0 and 100",
        },
        meta: {
          requestId: (req.headers["x-request-id"] as string) || "unknown",
        },
      });
    }

    const count = await jobsRepo.deleteJobsBelowScore(threshold);

    res.json({
      ok: true,
      data: {
        message: `Cleared ${count} jobs with score below ${threshold}`,
        count,
        threshold,
      },
      meta: { requestId: (req.headers["x-request-id"] as string) || "unknown" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message,
      },
      meta: { requestId: (req.headers["x-request-id"] as string) || "unknown" },
    });
  }
});
