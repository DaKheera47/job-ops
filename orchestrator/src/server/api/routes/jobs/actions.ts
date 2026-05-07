import { AppError, badRequest } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { setupSse, startSseHeartbeat, writeSseData } from "@infra/sse";
import { isDemoMode } from "@server/config/demo";
import { resolveRequestOrigin } from "@server/infra/request-origin";
import {
  createSharedRescoreProfileLoader,
  executeJobActionForJob,
  type JobActionExecutionOptions,
  mapJobActionFailure,
} from "@server/services/jobs/actions";
import { resolvePdfFingerprintContext } from "@server/services/pdf-fingerprint";
import { asyncPool } from "@server/utils/async-pool";
import type { JobActionResult, JobActionStreamEvent } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import {
  hydrateJobPdfFreshness,
  hydrateJobPdfFreshnessWithContext,
  JOB_ACTION_CONCURRENCY,
  jobActionRequestSchema,
} from "./shared";

export const jobsActionsRouter = Router();

jobsActionsRouter.post("/actions", async (req: Request, res: Response) => {
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

    const rawResults = await asyncPool({
      items: dedupedJobIds,
      concurrency: JOB_ACTION_CONCURRENCY,
      task: async (jobId) =>
        executeJobActionForJob(parsed.action, jobId, executionOptions),
    });
    const pdfFingerprintContext = await resolvePdfFingerprintContext();
    const results = await Promise.all(
      rawResults.map(async (result) =>
        result.ok
          ? {
              ...result,
              job: hydrateJobPdfFreshnessWithContext(
                result.job,
                pdfFingerprintContext,
              ),
            }
          : result,
      ),
    );

    const succeeded = results.filter((result) => result.ok).length;
    const failed = results.length - succeeded;
    const payload = {
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

jobsActionsRouter.post(
  "/actions/stream",
  async (req: Request, res: Response) => {
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
      const pdfFingerprintContext = await resolvePdfFingerprintContext();

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

          const rawResult = await executeJobActionForJob(
            action,
            jobId,
            executionOptions,
          );
          const result = rawResult.ok
            ? {
                ...rawResult,
                job: hydrateJobPdfFreshnessWithContext(
                  rawResult.job,
                  pdfFingerprintContext,
                ),
              }
            : rawResult;
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
  },
);

jobsActionsRouter.post("/:id/process", async (req: Request, res: Response) => {
  const forceRaw = req.query.force as string | undefined;
  const force = forceRaw === "1" || forceRaw === "true";
  const result = await executeJobActionForJob("move_to_ready", req.params.id, {
    forceMoveToReady: force,
    requestOrigin: resolveRequestOrigin(req),
  });
  if (!result.ok) return fail(res, mapJobActionFailure(result));
  ok(res, await hydrateJobPdfFreshness(result.job));
});

jobsActionsRouter.post("/:id/skip", async (req: Request, res: Response) => {
  const result = await executeJobActionForJob("skip", req.params.id);
  if (!result.ok) return fail(res, mapJobActionFailure(result));
  ok(res, await hydrateJobPdfFreshness(result.job));
});

jobsActionsRouter.post("/:id/rescore", async (req: Request, res: Response) => {
  const result = await executeJobActionForJob("rescore", req.params.id, {
    ...(isDemoMode()
      ? {}
      : { getProfileForRescore: createSharedRescoreProfileLoader() }),
  });
  if (!result.ok) return fail(res, mapJobActionFailure(result));
  ok(res, await hydrateJobPdfFreshness(result.job));
});
