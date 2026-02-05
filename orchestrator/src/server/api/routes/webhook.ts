import { unauthorized } from "@infra/errors";
import { fail, okWithMeta } from "@infra/http";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { type Request, type Response, Router } from "express";
import { isDemoMode } from "../../config/demo";
import { runPipeline } from "../../pipeline/index";
import { simulatePipelineRun } from "../../services/demo-simulator";

export const webhookRouter = Router();

/**
 * POST /api/webhook/trigger - Webhook endpoint for n8n to trigger the pipeline
 */
webhookRouter.post("/trigger", async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.WEBHOOK_SECRET;

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return fail(res, unauthorized());
  }

  try {
    if (isDemoMode()) {
      const simulated = await simulatePipelineRun();
      return okWithMeta(
        res,
        {
          message: "Pipeline trigger simulated in demo mode",
          triggeredAt: new Date().toISOString(),
          runId: simulated.runId,
        },
        { simulated: true },
      );
    }

    // Start pipeline in background
    runWithRequestContext({}, () => {
      runPipeline().catch((error) => {
        logger.error("Webhook-triggered pipeline run failed", error);
      });
    });

    res.json({
      ok: true,
      data: {
        message: "Pipeline triggered",
        triggeredAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res
      .status(500)
      .json({ ok: false, error: { code: "INTERNAL_ERROR", message } });
  }
});
