import { logger } from "@infra/logger";
import { sanitizeWebhookPayload } from "@infra/sanitize";
import * as settingsRepo from "../../repositories/settings";

export async function notifyPipelineWebhookStep(
  event: "pipeline.completed" | "pipeline.failed",
  payload: Record<string, unknown>,
): Promise<void> {
  const overridePipelineWebhookUrl =
    await settingsRepo.getSetting("pipelineWebhookUrl");
  const pipelineWebhookUrl = (
    overridePipelineWebhookUrl ||
    process.env.PIPELINE_WEBHOOK_URL ||
    process.env.WEBHOOK_URL ||
    ""
  ).trim();

  if (!pipelineWebhookUrl) return;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const secret = process.env.WEBHOOK_SECRET;
    if (secret) headers.Authorization = `Bearer ${secret}`;

    const sanitizedPayload = sanitizeWebhookPayload({
      event,
      sentAt: new Date().toISOString(),
      pipelineRunId: payload.pipelineRunId,
      jobsDiscovered: payload.jobsDiscovered,
      jobsScored: payload.jobsScored,
      jobsProcessed: payload.jobsProcessed,
      error: payload.error,
    });

    const response = await fetch(pipelineWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(sanitizedPayload),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      logger.warn("Pipeline webhook POST failed", {
        status: response.status,
        error: responseText.slice(0, 200),
      });
    }
  } catch (error) {
    logger.warn("Pipeline webhook POST failed", error);
  }
}
