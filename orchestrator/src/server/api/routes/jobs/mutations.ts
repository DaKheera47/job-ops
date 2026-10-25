import { AppError, conflict, notFound } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { isDemoMode, sendDemoBlocked } from "@server/config/demo";
import { resolveRequestOrigin } from "@server/infra/request-origin";
import * as jobsRepo from "@server/repositories/jobs";
import { reconcileActivationMilestonesFromHistorySafely } from "@server/services/activation-funnel";
import { removeStoredJobDocuments } from "@server/services/job-document-storage";
import { trackApplicationAcceptedIfNeeded } from "@server/services/jobs/analytics";
import { removeStoredJobPdf } from "@server/services/pdf-storage";
import { getTracerReadiness } from "@server/services/tracer-links";
import { type Request, type Response, Router } from "express";
import {
  hydrateJobPdfFreshness,
  isJobUrlConflictError,
  queueTailoringAutoPdfRegenerationIfNeeded,
  toJobsRouteError,
  updateJobSchema,
} from "./shared";

export const jobsMutationsRouter = Router();

jobsMutationsRouter.delete("/:id", async (req: Request, res: Response) => {
  const route = "DELETE /api/jobs/:id";
  const jobId = req.params.id;
  try {
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Deleting jobs is disabled to keep the demo stable.",
        { route, jobId },
      );
    }

    const result = await jobsRepo.deleteJob(jobId);
    if (result === "not_found") throw notFound("Job not found");
    if (result === "busy") {
      throw conflict(
        "This job is being processed. Wait for PDF generation or Ghostwriter to finish, then try again.",
      );
    }

    const cleanupResults = await Promise.allSettled([
      removeStoredJobPdf(jobId),
      removeStoredJobDocuments(jobId),
    ]);
    for (const result of cleanupResults) {
      if (result.status === "rejected") {
        logger.warn("Failed to remove deleted job files", {
          route,
          jobId,
          error: result.reason,
        });
      }
    }
    logger.info("Job deleted", { route, jobId });
    ok(res, null);
  } catch (error) {
    const err = toJobsRouteError(error);
    logger[err.status === 404 || err.status === 409 ? "warn" : "error"](
      "Job deletion failed",
      {
        route,
        jobId,
        status: err.status,
        code: err.code,
        details: err.details,
      },
    );
    fail(res, err);
  }
});

jobsMutationsRouter.patch("/:id", async (req: Request, res: Response) => {
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

    trackApplicationAcceptedIfNeeded({
      closedAt: job.closedAt,
      nextOutcome: job.outcome,
      previousOutcome: currentJob.outcome,
      requestOrigin: resolveRequestOrigin(req),
      source: "jobs_patch_route",
    });
    ok(res, await hydrateJobPdfFreshness(job));
    queueTailoringAutoPdfRegenerationIfNeeded(
      currentJob,
      job,
      "PATCH /api/jobs/:id",
    );
    if (Object.hasOwn(input, "closedAt") || Object.hasOwn(input, "outcome")) {
      queueMicrotask(() => {
        void reconcileActivationMilestonesFromHistorySafely({
          route: "PATCH /api/jobs/:id",
          jobId: req.params.id,
          updatedFields: Object.keys(input),
        });
      });
    }
  } catch (error) {
    const err = toJobsRouteError(error, {
      invalidRequestFallbackMessage: "Invalid job update request",
      conflictWhen: isJobUrlConflictError,
      conflictMessage: "Another job already uses that job URL",
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
