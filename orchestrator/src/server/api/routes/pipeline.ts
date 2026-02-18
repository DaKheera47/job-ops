import { AppError, badRequest, conflict, requestTimeout } from "@infra/errors";
import { fail, ok, okWithMeta } from "@infra/http";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { setupSse, startSseHeartbeat, writeSseData } from "@infra/sse";
import type { PipelineStatusResponse } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import { isDemoMode } from "../../config/demo";
import {
  getPipelineStatus,
  requestPipelineCancel,
  runPipeline,
  subscribeToProgress,
} from "../../pipeline/index";
import * as pipelineRepo from "../../repositories/pipeline";
import { simulatePipelineRun } from "../../services/demo-simulator";

export const pipelineRouter = Router();

/**
 * GET /api/pipeline/status - Get pipeline status
 */
pipelineRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const { isRunning } = getPipelineStatus();
    const lastRun = await pipelineRepo.getLatestPipelineRun();
    const data: PipelineStatusResponse = {
      isRunning,
      lastRun,
      nextScheduledRun: null,
    };
    ok(res, data);
  } catch (error) {
    fail(
      res,
      new AppError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
});

/**
 * GET /api/pipeline/progress - Server-Sent Events endpoint for live progress
 */
pipelineRouter.get("/progress", (req: Request, res: Response) => {
  setupSse(res, { disableBuffering: true });

  // Send initial progress
  const sendProgress = (data: unknown) => {
    writeSseData(res, data);
  };

  // Subscribe to progress updates
  const unsubscribe = subscribeToProgress(sendProgress);

  // Send heartbeat every 30 seconds to keep connection alive
  const stopHeartbeat = startSseHeartbeat(res);

  // Cleanup on close
  req.on("close", () => {
    stopHeartbeat();
    unsubscribe();
  });
});

/**
 * GET /api/pipeline/runs - Get recent pipeline runs
 */
pipelineRouter.get("/runs", async (_req: Request, res: Response) => {
  try {
    const runs = await pipelineRepo.getRecentPipelineRuns(20);
    ok(res, runs);
  } catch (error) {
    fail(
      res,
      new AppError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
});

/**
 * POST /api/pipeline/run - Trigger the pipeline manually
 */
const runPipelineSchema = z.object({
  topN: z.number().min(1).max(50).optional(),
  minSuitabilityScore: z.number().min(0).max(100).optional(),
  sources: z
    .array(
      z.enum([
        "gradcracker",
        "indeed",
        "linkedin",
        "glassdoor",
        "ukvisajobs",
        "adzuna",
      ]),
    )
    .min(1)
    .optional(),
});

pipelineRouter.post("/run", async (req: Request, res: Response) => {
  try {
    const config = runPipelineSchema.parse(req.body);

    if (isDemoMode()) {
      const simulated = await simulatePipelineRun(config);
      return okWithMeta(res, simulated, { simulated: true });
    }

    // Start pipeline in background
    runWithRequestContext({}, () => {
      runPipeline(config).catch((error) => {
        logger.error("Background pipeline run failed", error);
      });
    });
    ok(res, { message: "Pipeline started" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    if (error instanceof Error && error.name === "AbortError") {
      return fail(res, requestTimeout("Request timed out"));
    }
    fail(
      res,
      new AppError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
});

/**
 * POST /api/pipeline/cancel - Request cancellation of active pipeline run
 */
pipelineRouter.post("/cancel", async (_req: Request, res: Response) => {
  try {
    const cancelResult = requestPipelineCancel();
    if (!cancelResult.accepted) {
      return fail(res, conflict("No running pipeline to cancel"));
    }

    logger.info("Pipeline cancellation requested", {
      route: "/api/pipeline/cancel",
      action: "cancel",
      status: "accepted",
      pipelineRunId: cancelResult.pipelineRunId,
      alreadyRequested: cancelResult.alreadyRequested,
    });

    ok(res, {
      message: cancelResult.alreadyRequested
        ? "Pipeline cancellation already requested"
        : "Pipeline cancellation requested",
      pipelineRunId: cancelResult.pipelineRunId,
      alreadyRequested: cancelResult.alreadyRequested,
    });
  } catch (error) {
    fail(
      res,
      new AppError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
});
