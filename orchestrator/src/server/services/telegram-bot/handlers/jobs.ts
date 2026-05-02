import { join } from "node:path";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { InputFile } from "grammy";
import type { JobStatus } from "@shared/types";
import * as jobsRepo from "../../../repositories/jobs";
import { getDataDir } from "../../../config/dataDir";
import { formatJobCard, formatJobListItem } from "../formatting";

const PAGE_SIZE = 5;

export function registerJobHandlers(bot: Bot): void {
  // Job list: j:ready:0, j:applied:0, j:discovered:0
  bot.callbackQuery(/^j:(ready|applied|discovered|all):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const status = ctx.match![1] as JobStatus | "all";
    const page = parseInt(ctx.match![2], 10);

    const statuses: JobStatus[] | undefined =
      status === "all" ? undefined : [status as JobStatus];
    const allJobs = await jobsRepo.getJobListItems(statuses);

    // Sort by suitability score descending (highest first)
    allJobs.sort((a, b) => (b.suitabilityScore ?? -1) - (a.suitabilityScore ?? -1));

    const totalPages = Math.max(1, Math.ceil(allJobs.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages - 1);
    const pageJobs = allJobs.slice(
      safePage * PAGE_SIZE,
      (safePage + 1) * PAGE_SIZE,
    );

    const statusLabel = status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1);
    let text = `<b>📋 ${statusLabel} Jobs (${allJobs.length})</b>\n\n`;

    if (pageJobs.length === 0) {
      text += "No jobs found.";
    } else {
      text += pageJobs
        .map((j, i) => formatJobListItem(j, safePage * PAGE_SIZE + i))
        .join("\n\n");
    }

    const keyboard = new InlineKeyboard();

    // Job detail buttons — compact: "⭐87 Title @ Company"
    for (const j of pageJobs) {
      const shortId = j.id.slice(0, 8);
      const score = j.suitabilityScore !== null ? `⭐${j.suitabilityScore}` : "";
      const company = j.employer.slice(0, 15);
      const title = j.title.slice(0, 22);
      keyboard.text(`${score} ${title} · ${company}`, `j:d:${shortId}`).row();
    }

    // Pagination
    const navRow = new InlineKeyboard();
    if (safePage > 0) navRow.text("◀️ Prev", `j:${status}:${safePage - 1}`);
    navRow.text(`${safePage + 1}/${totalPages}`, "noop");
    if (safePage < totalPages - 1) navRow.text("▶️ Next", `j:${status}:${safePage + 1}`);

    keyboard.row();
    if (safePage > 0) keyboard.text("◀️", `j:${status}:${safePage - 1}`);
    keyboard.text(`${safePage + 1}/${totalPages}`, "noop");
    if (safePage < totalPages - 1) keyboard.text("▶️", `j:${status}:${safePage + 1}`);

    keyboard.row().text("◀️ Back", "m:menu");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // No-op callback for page indicator
  bot.callbackQuery("noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // Job detail: j:d:abc12345
  bot.callbackQuery(/^j:d:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const shortId = ctx.match![1];

    // Find job by short ID prefix
    const allJobs = await jobsRepo.getJobListItems();
    const match = allJobs.find((j) => j.id.startsWith(shortId));
    if (!match) {
      await ctx.editMessageText("Job not found.");
      return;
    }

    const job = await jobsRepo.getJobById(match.id);
    if (!job) {
      await ctx.editMessageText("Job not found.");
      return;
    }

    const text = formatJobCard(job);
    const sid = job.id.slice(0, 8);

    const keyboard = new InlineKeyboard();

    if (job.status === "ready") {
      keyboard.text("✅ Mark Applied", `j:apply:${sid}`);
      keyboard.text("⏭ Skip", `j:skip:${sid}`);
      keyboard.row();
    }

    if (job.pdfPath) {
      keyboard.text("📄 Download PDF", `j:pdf:${sid}`);
    }

    if (job.jobUrl || job.applicationLink) {
      keyboard.text("🔗 Open Listing", `j:url:${sid}`);
    }

    if (job.source === "linkedin" && job.status === "ready") {
      keyboard.row().text("🚀 Auto Apply", `j:auto:${sid}`);
    }

    keyboard.row().text("◀️ Back", `j:${job.status}:0`);

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Mark applied
  bot.callbackQuery(/^j:apply:(.+)$/, async (ctx) => {
    const shortId = ctx.match![1];
    const allJobs = await jobsRepo.getJobListItems();
    const match = allJobs.find((j) => j.id.startsWith(shortId));
    if (!match) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }

    await jobsRepo.updateJob(match.id, {
      status: "applied",
      appliedAt: new Date().toISOString(),
    });
    await ctx.answerCallbackQuery("✅ Marked as applied!");
    await ctx.editMessageText(`✅ <b>${match.title}</b> marked as applied!`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("◀️ Back", "j:ready:0").text("◀️ Menu", "m:menu"),
    });
  });

  // Skip job
  bot.callbackQuery(/^j:skip:(.+)$/, async (ctx) => {
    const shortId = ctx.match![1];
    const allJobs = await jobsRepo.getJobListItems();
    const match = allJobs.find((j) => j.id.startsWith(shortId));
    if (!match) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }

    await jobsRepo.updateJob(match.id, { status: "skipped" });
    await ctx.answerCallbackQuery("⏭ Skipped!");
    await ctx.editMessageText(`⏭ <b>${match.title}</b> skipped.`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("◀️ Back", "j:ready:0").text("◀️ Menu", "m:menu"),
    });
  });

  // Download PDF
  bot.callbackQuery(/^j:pdf:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Sending PDF...");
    const shortId = ctx.match![1];
    const allJobs = await jobsRepo.getJobListItems();
    const match = allJobs.find((j) => j.id.startsWith(shortId));
    if (!match) return;

    const job = await jobsRepo.getJobById(match.id);
    if (!job?.pdfPath) {
      await ctx.reply("No PDF available for this job.");
      return;
    }

    const pdfFullPath = job.pdfPath.startsWith("/")
      ? job.pdfPath
      : join(getDataDir(), "pdfs", job.pdfPath);

    try {
      await ctx.replyWithDocument(new InputFile(pdfFullPath), {
        caption: `📄 ${job.title} — ${job.employer}`,
      });
    } catch {
      await ctx.reply("Failed to send PDF. File may not exist.");
    }
  });

  // Open listing URL
  bot.callbackQuery(/^j:url:(.+)$/, async (ctx) => {
    const shortId = ctx.match![1];
    const allJobs = await jobsRepo.getJobListItems();
    const match = allJobs.find((j) => j.id.startsWith(shortId));
    if (!match) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }

    const job = await jobsRepo.getJobById(match.id);
    const url = job?.applicationLink || job?.jobUrl || "";
    if (url) {
      await ctx.answerCallbackQuery();
      await ctx.reply(`🔗 ${url}`);
    } else {
      await ctx.answerCallbackQuery("No URL available");
    }
  });

  // Single auto-apply trigger
  bot.callbackQuery(/^j:auto:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Starting auto-apply...");
    const shortId = ctx.match![1];
    const allJobs = await jobsRepo.getJobListItems();
    const match = allJobs.find((j) => j.id.startsWith(shortId));
    if (!match) return;

    await ctx.reply(
      `🚀 Auto-apply started for <b>${match.title}</b>.\n\nWatch the browser viewer on your laptop.`,
      { parse_mode: "HTML" },
    );

    // Import lazily to avoid circular deps
    const { startEasyApply } = await import("../../linkedin-auto-apply");
    const { getProfile } = await import("../../profile");
    const job = await jobsRepo.getJobById(match.id);
    if (!job) return;

    const profile = await getProfile();
    const basics = profile?.basics;
    const jobUrl = job.applicationLink || job.jobUrlDirect || job.jobUrl;

    try {
      const result = await startEasyApply({
        jobId: job.id,
        jobUrl,
        pdfPath: job.pdfPath,
        profileName: basics?.name || "",
        profileEmail: basics?.email || "",
        profilePhone: basics?.phone || "",
        autoSubmit: false,
      });

      if (result.success) {
        await jobsRepo.updateJob(job.id, {
          status: "applied",
          appliedAt: new Date().toISOString(),
        });
        await ctx.reply(`✅ <b>${job.title}</b> — applied!`, { parse_mode: "HTML" });
      } else if (result.manualRequired) {
        await ctx.reply(
          `⚠️ <b>${job.title}</b> — no Easy Apply.\n\n🔗 Apply manually: ${jobUrl}`,
          { parse_mode: "HTML" },
        );
      } else {
        await ctx.reply(`❌ <b>${job.title}</b> — failed: ${result.error}`, { parse_mode: "HTML" });
      }
    } catch (err) {
      await ctx.reply(
        `❌ Error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
}
