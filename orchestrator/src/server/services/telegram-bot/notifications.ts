import { logger } from "@infra/logger";
import { InlineKeyboard } from "grammy";
import { subscribeToProgress } from "../../pipeline/progress";
import { subscribeToBatchProgress } from "../linkedin-auto-apply/batch";
import { areNotificationsEnabled, getAuthorizedChatIds } from "./auth";
import { getBot } from "./bot";

let pipelineUnsub: (() => void) | null = null;
let batchUnsub: (() => void) | null = null;

async function broadcast(
  text: string,
  options?: { reply_markup?: InlineKeyboard },
): Promise<void> {
  const bot = getBot();
  if (!bot) return;

  if (!(await areNotificationsEnabled())) return;

  const chatIds = await getAuthorizedChatIds();
  for (const chatId of chatIds) {
    try {
      await bot.api.sendMessage(chatId, text, {
        parse_mode: "HTML",
        reply_markup: options?.reply_markup,
      });
    } catch (err) {
      logger.warn("Failed to send Telegram notification", {
        chatId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function startNotificationSubscriptions(): void {
  // Pipeline completion/failure notifications
  let lastPipelineStep = "idle";

  pipelineUnsub = subscribeToProgress((progress) => {
    if (progress.step === "completed" && lastPipelineStep !== "completed") {
      broadcast(
        `<b>✅ Pipeline Complete!</b>\n\n` +
          `📥 ${progress.jobsDiscovered ?? 0} discovered\n` +
          `⭐ ${progress.jobsScored ?? 0} scored\n` +
          `📄 ${progress.jobsProcessed ?? 0} processed`,
        {
          reply_markup: new InlineKeyboard()
            .text("📋 View Ready Jobs", "j:ready:0")
            .text("🚀 Auto Apply", "a:status"),
        },
      );
    }

    if (progress.step === "failed" && lastPipelineStep !== "failed") {
      broadcast(
        `<b>❌ Pipeline Failed</b>\n\n` +
          `Error: ${progress.error || "Unknown error"}\n` +
          `Step: ${progress.message || lastPipelineStep}`,
        {
          reply_markup: new InlineKeyboard()
            .text("🔄 Retry", "p:run")
            .text("📊 Details", "p:status"),
        },
      );
    }

    lastPipelineStep = progress.step;
  });

  // Batch apply completion notifications
  let wasBatchRunning = false;

  batchUnsub = subscribeToBatchProgress((progress) => {
    if (wasBatchRunning && !progress.running) {
      const applied = progress.results.filter((r) => r.status === "applied").length;
      const failed = progress.results.filter((r) => r.status === "failed").length;
      const manual = progress.results.filter((r) => r.status === "manual_required").length;

      const lines = [`<b>🚀 Batch Apply Complete!</b>`, ""];
      if (applied > 0) lines.push(`✅ ${applied} applied`);
      if (manual > 0) lines.push(`⚠️ ${manual} manual required`);
      if (failed > 0) lines.push(`❌ ${failed} failed`);

      // Show failed job details
      const failedJobs = progress.results.filter(
        (r) => r.status === "failed" || r.status === "manual_required",
      );
      if (failedJobs.length > 0) {
        lines.push("");
        for (const j of failedJobs.slice(0, 5)) {
          const icon = j.status === "failed" ? "❌" : "⚠️";
          lines.push(`${icon} ${j.jobTitle}: ${j.error || j.status}`);
        }
      }

      broadcast(lines.join("\n"), {
        reply_markup: new InlineKeyboard()
          .text("📋 Applied", "j:applied:0")
          .text("◀️ Menu", "m:menu"),
      });
    }

    wasBatchRunning = progress.running;
  });
}

export function stopNotificationSubscriptions(): void {
  if (pipelineUnsub) {
    pipelineUnsub();
    pipelineUnsub = null;
  }
  if (batchUnsub) {
    batchUnsub();
    batchUnsub = null;
  }
}
