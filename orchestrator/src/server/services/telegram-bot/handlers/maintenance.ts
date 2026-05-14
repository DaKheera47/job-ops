/**
 * Telegram handlers for maintenance/bulk actions:
 *   /refresh-pdfs   — regenerate resume PDFs for every "ready" job using the
 *                     current design resume (e.g. after editing the email or
 *                     phone number on the profile).
 *
 * The regeneration is gentle: it reuses the existing tailored summary /
 * headline / skills / project selection that's already stored on the job
 * row, so no new LLM calls are made.  Only the PDF render step runs again,
 * which means no extra cost and ~1-3 seconds per job.
 */

import { logger } from "@infra/logger";
import { generateFinalPdf } from "@server/pipeline/orchestrator";
import * as jobsRepo from "@server/repositories/jobs";
import { type Bot, type Context, InlineKeyboard } from "grammy";
import { escapeHtml } from "../formatting";

const REFRESH_CONCURRENCY = 2;

async function asyncPool<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }).map(async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await task(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function refreshReadyPdfs(ctx: Context): Promise<void> {
  const jobs = await jobsRepo.getAllJobs(["ready"]);
  const eligible = jobs.filter((job) => Boolean(job.pdfPath));

  if (eligible.length === 0) {
    const text =
      "<b>🔄 Refresh PDFs</b>\n\nNo 'ready' jobs with a generated PDF found. Nothing to refresh.";
    if (ctx.callbackQuery) {
      await ctx.editMessageText(text, { parse_mode: "HTML" });
    } else {
      await ctx.reply(text, { parse_mode: "HTML" });
    }
    return;
  }

  const headerText =
    `<b>🔄 Refreshing PDFs (${eligible.length})</b>\n\n` +
    "Re-rendering each 'ready' resume with the current design profile. " +
    "This re-uses the existing tailored content — no new LLM calls.\n";

  let progressMessage: { chatId: number; messageId: number } | null = null;
  if (ctx.callbackQuery) {
    const edited = await ctx
      .editMessageText(`${headerText}\nStarting…`, { parse_mode: "HTML" })
      .catch(() => null);
    if (edited && typeof edited !== "boolean" && ctx.chat) {
      progressMessage = { chatId: ctx.chat.id, messageId: edited.message_id };
    }
  } else {
    const reply = await ctx.reply(`${headerText}\nStarting…`, {
      parse_mode: "HTML",
    });
    if (ctx.chat) {
      progressMessage = { chatId: ctx.chat.id, messageId: reply.message_id };
    }
  }

  let successCount = 0;
  let failedCount = 0;
  const failures: Array<{ title: string; employer: string; error: string }> =
    [];
  let lastEditAt = 0;

  const updateProgress = async (force = false): Promise<void> => {
    if (!progressMessage) return;
    const now = Date.now();
    if (!force && now - lastEditAt < 2500) return;
    lastEditAt = now;
    const done = successCount + failedCount;
    const lines = [
      headerText,
      `✅ Done: ${successCount}`,
      failedCount > 0 ? `❌ Failed: ${failedCount}` : null,
      `⏳ Progress: ${done}/${eligible.length}`,
    ].filter(Boolean) as string[];
    await ctx.api
      .editMessageText(
        progressMessage.chatId,
        progressMessage.messageId,
        lines.join("\n"),
        { parse_mode: "HTML" },
      )
      .catch(() => {});
  };

  await asyncPool(eligible, REFRESH_CONCURRENCY, async (job) => {
    try {
      const result = await generateFinalPdf(job.id, {
        force: false,
        analyticsOrigin: "generate_pdf",
      });
      if (result.success) {
        successCount += 1;
      } else {
        failedCount += 1;
        failures.push({
          title: job.title,
          employer: job.employer,
          error: result.error ?? "Unknown error",
        });
      }
    } catch (error) {
      failedCount += 1;
      failures.push({
        title: job.title,
        employer: job.employer,
        error: error instanceof Error ? error.message : String(error),
      });
      logger.warn("Refresh-pdfs: PDF regeneration failed", {
        jobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await updateProgress();
  });

  const finalLines: string[] = [
    `<b>🔄 Refresh PDFs — complete</b>`,
    "",
    `✅ Regenerated: ${successCount}`,
  ];
  if (failedCount > 0) {
    finalLines.push(`❌ Failed: ${failedCount}`);
    finalLines.push("");
    for (const f of failures.slice(0, 5)) {
      finalLines.push(
        `• <b>${escapeHtml(f.title)}</b> @ ${escapeHtml(f.employer)}`,
      );
      finalLines.push(
        `  <i>${escapeHtml(f.error.slice(0, 200))}</i>`,
      );
    }
    if (failures.length > 5) {
      finalLines.push(`<i>+${failures.length - 5} more — see server logs.</i>`);
    }
  }

  const keyboard = new InlineKeyboard()
    .text("📋 Ready Jobs", "j:ready:0")
    .text("◀️ Menu", "m:menu");
  if (progressMessage) {
    await ctx.api
      .editMessageText(
        progressMessage.chatId,
        progressMessage.messageId,
        finalLines.join("\n"),
        { parse_mode: "HTML", reply_markup: keyboard },
      )
      .catch(() => {});
  } else {
    await ctx.reply(finalLines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  }
}

async function showConfirm(ctx: Context): Promise<void> {
  const jobs = await jobsRepo.getAllJobs(["ready"]);
  const eligible = jobs.filter((job) => Boolean(job.pdfPath));

  const text =
    `<b>🔄 Refresh PDFs</b>\n\n` +
    `Will re-render <b>${eligible.length}</b> resume PDF(s) for jobs in <i>ready</i> status.\n\n` +
    `<i>Use this after editing your profile (email, phone, address) — it doesn't change the tailored content, only re-renders with the latest design resume. No LLM calls.</i>`;

  const keyboard = new InlineKeyboard()
    .text(`🔄 Refresh ${eligible.length} PDF(s)`, "mx:refresh-pdfs:go")
    .row()
    .text("◀️ Menu", "m:menu");

  if (ctx.callbackQuery) {
    await ctx
      .editMessageText(text, { parse_mode: "HTML", reply_markup: keyboard })
      .catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  }
}

export function registerMaintenanceHandlers(bot: Bot): void {
  bot.command("refresh_pdfs", showConfirm);
  bot.command("refresh-pdfs", showConfirm);

  bot.callbackQuery("mx:refresh-pdfs", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await showConfirm(ctx);
  });

  bot.callbackQuery("mx:refresh-pdfs:go", async (ctx) => {
    await ctx.answerCallbackQuery("Refreshing…").catch(() => {});
    await refreshReadyPdfs(ctx);
  });
}
