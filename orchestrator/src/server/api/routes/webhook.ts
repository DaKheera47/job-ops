import { type Request, type Response, Router } from "express";
import { runPipeline } from "../../pipeline/index.js";

export const webhookRouter = Router();

/**
 * POST /api/webhook/trigger - Webhook endpoint for n8n to trigger the pipeline
 */
webhookRouter.post("/trigger", async (req: Request, res: Response) => {
  // Optional: Add authentication check
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.WEBHOOK_SECRET;

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    // Start pipeline in background
    runPipeline().catch(console.error);

    res.json({
      success: true,
      data: {
        message: "Pipeline triggered",
        triggeredAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});
