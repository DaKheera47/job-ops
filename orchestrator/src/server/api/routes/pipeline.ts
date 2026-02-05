import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import type { ApiResponse, PipelineStatusResponse } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import {
  getPipelineStatus,
  runPipeline,
  subscribeToProgress,
} from "../../pipeline/index";
import * as pipelineRepo from "../../repositories/pipeline";

export const pipelineRouter = Router();

/**
 * GET /api/pipeline/status - Get pipeline status
 */
pipelineRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const { isRunning } = getPipelineStatus();
    const lastRun = await pipelineRepo.getLatestPipelineRun();

    const response: ApiResponse<PipelineStatusResponse> = {
      ok: true,
      data: {
        isRunning,
        lastRun,
        nextScheduledRun: null, // Would come from n8n
      },
    };

    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res
      .status(500)
      .json({ ok: false, error: { code: "INTERNAL_ERROR", message } });
  }
});

/**
 * GET /api/pipeline/progress - Server-Sent Events endpoint for live progress
 */
pipelineRouter.get("/progress", (req: Request, res: Response) => {
  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx buffering

  // Send initial progress
  const sendProgress = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Subscribe to progress updates
  const unsubscribe = subscribeToProgress(sendProgress);

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 30000);

  // Cleanup on close
  req.on("close", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

/**
 * GET /api/pipeline/runs - Get recent pipeline runs
 */
pipelineRouter.get("/runs", async (_req: Request, res: Response) => {
  try {
    const runs = await pipelineRepo.getRecentPipelineRuns(20);
    res.json({ ok: true, data: runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res
      .status(500)
      .json({ ok: false, error: { code: "INTERNAL_ERROR", message } });
  }
});

/**
 * POST /api/pipeline/run - Trigger the pipeline manually
 */
const runPipelineSchema = z.object({
  topN: z.number().min(1).max(50).optional(),
  minSuitabilityScore: z.number().min(0).max(100).optional(),
  sources: z
    .array(z.enum(["gradcracker", "indeed", "linkedin", "ukvisajobs"]))
    .min(1)
    .optional(),
});

pipelineRouter.post("/run", async (req: Request, res: Response) => {
  try {
    const config = runPipelineSchema.parse(req.body);

    // Start pipeline in background
    runWithRequestContext({}, () => {
      runPipeline(config).catch((error) => {
        logger.error("Background pipeline run failed", error);
      });
    });

    res.json({
      ok: true,
      data: { message: "Pipeline started" },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        ok: false,
        error: { code: "INVALID_REQUEST", message: error.message },
      });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res
      .status(500)
      .json({ ok: false, error: { code: "INTERNAL_ERROR", message } });
  }
});
