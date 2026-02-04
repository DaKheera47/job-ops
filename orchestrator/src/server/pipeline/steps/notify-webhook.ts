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

    const response = await fetch(pipelineWebhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        event,
        sentAt: new Date().toISOString(),
        ...payload,
      }),
    });

    if (!response.ok) {
      console.warn(
        `⚠️ Pipeline webhook POST failed (${response.status}): ${await response.text()}`,
      );
    }
  } catch (error) {
    console.warn("⚠️ Pipeline webhook POST failed:", error);
  }
}
