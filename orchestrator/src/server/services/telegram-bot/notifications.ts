import { logger } from "@infra/logger";
import { InlineKeyboard } from "grammy";
import { subscribeToProgress } from "../../pipeline/progress";
import { getLatestPipelineRunWithDetails } from "../../repositories/pipeline";
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
  // Telegram global limit is ~30 messages/sec across all chats. We're far
  // below that today (1 user) but a small inter-message delay future-proofs
  // the broadcast and avoids 429s when the user list grows.
  const SEND_INTERVAL_MS = 50;
  let first = true;
  for (const chatId of chatIds) {
    if (!first) await new Promise((r) => setTimeout(r, SEND_INTERVAL_MS));
    first = false;
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

/**
 * Decide whether a `configuration_required` pause message describes a
 * transient AI failure (5xx, rate-limit, ≥30%-failure escalation) or a
 * genuine LLM-config problem (missing key, wrong provider).  Exported so
 * the CTA-picking logic can be unit-tested without spinning up the bot.
 */
export function isTransientConfigurationReason(reason: string): boolean {
  const e = reason.toLowerCase();
  return (
    e.includes("temporarily") ||
    e.includes("rate-limit") ||
    e.includes("rate limit") ||
    e.includes("failed for") || // the >30%-failure escalation
    e.includes("provider may be down")
  );
}

/**
 * Render a transparent pipeline-completion message including the full
 * funnel breakdown.  Pulls filter metrics from `pipeline_runs.resultSummary`
 * so the user can see WHERE jobs were dropped — eliminating the "where did
 * these strange vacancies come from?" question that motivated this whole
 * subsystem.
 */
export async function buildCompletionMessage(): Promise<string> {
  let summary: Awaited<ReturnType<typeof getLatestPipelineRunWithDetails>>;
  try {
    summary = await getLatestPipelineRunWithDetails();
  } catch (error) {
    logger.warn("Failed to load pipeline run details for Telegram summary", {
      error: error instanceof Error ? error.message : String(error),
    });
    summary = null;
  }
  if (!summary) {
    return "<b>✅ Pipeline Complete!</b>";
  }

  const { run, savedDetails } = summary;
  const fm = savedDetails?.resultSummary?.filterMetrics ?? {};
  const funnel = run.funnel;
  const lines = ["<b>✅ Pipeline Complete!</b>", ""];

  // Top-line funnel: searched → imported → screened → scored → selected
  lines.push(`🔎 <b>Searched:</b> ${funnel?.searched ?? 0}`);
  lines.push(
    `📥 <b>Imported (new):</b> ${run.jobsDiscovered} ` +
      `<i>(${funnel?.deduplicated ?? 0} dedup, ${
        funnel?.livenessFiltered ?? 0
      } dead links)</i>`,
  );

  // Pre-scoring filters
  const filteredLines: string[] = [];
  if (fm.relocationSkipped && fm.relocationSkipped > 0) {
    filteredLines.push(
      `   • 🏠 Relocation (non-Munich, non-remote): ${fm.relocationSkipped}`,
    );
  }
  if (fm.antiDomainSkipped && fm.antiDomainSkipped > 0) {
    const topReasons = Object.entries(fm.antiDomainByReason ?? {})
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([k, v]) => `${k.replace(/_/g, " ")}=${v}`)
      .join(", ");
    filteredLines.push(
      `   • 🚫 Wrong domain: ${fm.antiDomainSkipped}` +
        (topReasons ? ` <i>(${topReasons})</i>` : ""),
    );
  }
  if (fm.languageGateSkipped && fm.languageGateSkipped > 0) {
    filteredLines.push(
      `   • 🌐 Language not in resume: ${fm.languageGateSkipped}`,
    );
  }
  if (fm.noResumeSignalSkipped && fm.noResumeSignalSkipped > 0) {
    filteredLines.push(
      `   • 🪞 No keyword overlap with resume: ${fm.noResumeSignalSkipped}`,
    );
  }
  if (filteredLines.length > 0) {
    lines.push(`🔧 <b>Pre-scoring filters:</b>`);
    lines.push(...filteredLines);
  }

  lines.push(
    `⭐ <b>Scored by AI:</b> ${funnel?.scored ?? 0}` +
      (fm.scoringTransientFailures
        ? ` <i>(${fm.scoringTransientFailures} transient AI failures retried next run)</i>`
        : ""),
  );
  if (funnel?.autoSkipped && funnel.autoSkipped > 0) {
    lines.push(`   • ⬇️ Auto-skipped below threshold: ${funnel.autoSkipped}`);
  }
  if (funnel?.ghostFlagged && funnel.ghostFlagged > 0) {
    lines.push(`   • 👻 Ghost-job flagged: ${funnel.ghostFlagged}`);
  }
  lines.push(`📄 <b>Tailored & ready:</b> ${run.jobsProcessed}`);

  // Loud banner if the screening ran degraded (resume failed to load)
  if (fm.screeningDegraded) {
    lines.push("");
    lines.push(
      `⚠️ <i>Heads up: screening ran in degraded mode (${
        fm.screeningDegradationReason ?? "unknown"
      }).  Language and keyword gates were disabled for this run — you may see more off-target jobs than usual.  Re-upload your design resume to restore full screening.</i>`,
    );
  }

  return lines.join("\n");
}

export function startNotificationSubscriptions(): void {
  // Pipeline completion/failure notifications
  let lastPipelineStep = "idle";

  pipelineUnsub = subscribeToProgress((progress) => {
    if (progress.step === "completed" && lastPipelineStep !== "completed") {
      // Async-fire — the broadcast() helper tolerates an awaited rendering
      // step before sending.  We deliberately don't block the listener.
      void buildCompletionMessage().then((text) =>
        broadcast(text, {
          reply_markup: new InlineKeyboard()
            .text("📋 View Ready Jobs", "j:ready:0")
            .text("📈 Insights", "i:w:30"),
        }),
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

    if (
      progress.step === "configuration_required" &&
      lastPipelineStep !== "configuration_required"
    ) {
      // The detail message comes from the orchestrator and tells us WHY
      // we paused.  We classify it here just to pick the right CTA layout:
      //   • config-class       → "Settings" + "Cancel"
      //   • transient/quota    → "Wait" + "Cancel"
      // The actual wait is automatic — pressing "Wait" only acknowledges
      // the notification; the pipeline already waits on `activeLlmConfigState`.
      const errMsg = progress.error || progress.detail || "";
      const isTransient = isTransientConfigurationReason(errMsg);

      const heading = isTransient
        ? "⏸️ Pipeline Paused — AI Temporarily Unavailable"
        : "⚠️ Pipeline Paused — LLM Configuration Required";
      const body = isTransient
        ? `${progress.error || progress.detail || "AI scoring is failing."}\n\n` +
          `<b>What now?</b>\n` +
          `• <b>Wait</b> — leave the run paused; press <b>Resume</b> in a few minutes to retry. ` +
          `Jobs that already failed will be re-scored on the next run.\n` +
          `• <b>Cancel</b> — stop this run; all scored work is kept. You can re-run later.`
        : `${progress.error || progress.detail || "AI scoring failed."}\n\n` +
          `<b>What now?</b>\n` +
          `• <b>Settings</b> — fix the LLM configuration (API key / model / provider), then press <b>Resume</b>.\n` +
          `• <b>Cancel</b> — stop this run; all scored work so far is kept.`;

      const keyboard = isTransient
        ? new InlineKeyboard()
            .text("▶️ Resume", "p:resume-scoring")
            .text("❌ Cancel run", "p:cancel")
        : new InlineKeyboard()
            .text("⚙️ Settings", "x:menu")
            .text("▶️ Resume", "p:resume-scoring")
            .row()
            .text("❌ Cancel run", "p:cancel");

      broadcast(`<b>${heading}</b>\n\n${body}`, { reply_markup: keyboard });
    }

    if (progress.step === "cancelled" && lastPipelineStep !== "cancelled") {
      broadcast(
        `<b>🛑 Pipeline Cancelled</b>\n\n` +
          `${progress.message || "Run was cancelled before completion."}`,
        {
          reply_markup: new InlineKeyboard()
            .text("🔄 Run again", "p:run")
            .text("📊 Status", "p:status"),
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
