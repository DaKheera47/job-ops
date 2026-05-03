import { join } from "node:path";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { InputFile } from "grammy";
import type { JobStatus } from "@shared/types";
import * as jobsRepo from "../../../repositories/jobs";
import * as settingsRepo from "../../../repositories/settings";
import { getDataDir } from "../../../config/dataDir";
import { safeFilePart } from "../../pdf-storage";
import { formatJobCard, formatJobListItem, escapeHtml } from "../formatting";

const PAGE_SIZE = 5;

export function registerJobHandlers(bot: Bot): void {
  // Job list: j:ready:0, j:applied:0, j:discovered:0, j:in_progress:0
  bot.callbackQuery(/^j:(ready|applied|discovered|in_progress|all):(\d+)$/, async (ctx) => {
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

    const statusLabels: Record<string, string> = {
      ready: "Ready",
      applied: "Applied",
      discovered: "Discovered",
      in_progress: "In Progress",
      all: "All",
    };
    const statusLabel = statusLabels[status] || status;
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
    if (safePage > 0) keyboard.text("◀️", `j:${status}:${safePage - 1}`);
    keyboard.text(`${safePage + 1}/${totalPages}`, "noop");
    if (safePage < totalPages - 1) keyboard.text("▶️", `j:${status}:${safePage + 1}`);

    // Tab navigation
    keyboard.row();
    if (status !== "ready") keyboard.text("✅ Ready", "j:ready:0");
    if (status !== "applied") keyboard.text("📨 Applied", "j:applied:0");
    if (status !== "in_progress") keyboard.text("🔄 In Progress", "j:in_progress:0");

    keyboard.row().text("◀️ Menu", "m:menu");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // No-op callback for page indicator and disabled buttons
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
    const jobUrl = job.applicationLink || job.jobUrl;

    const keyboard = new InlineKeyboard();

    if (job.status === "ready") {
      keyboard.text("✅ Mark Applied", `j:apply:${sid}`);
      keyboard.text("⏭ Skip", `j:skip:${sid}`);
      keyboard.row();
      keyboard.text("🚫 Block Company", `j:block:${sid}`);
      keyboard.row();
    }

    if (job.status === "discovered") {
      keyboard.text("🚫 Block Company", `j:block:${sid}`);
      keyboard.row();
    }

    if (job.status === "applied") {
      keyboard.text("🔄 Mark In Progress", `j:inprog:${sid}`);
      keyboard.row();
    }

    if (job.pdfPath) {
      keyboard.text("📄 Download PDF", `j:pdf:${sid}`);
    }

    if (jobUrl) {
      keyboard.url("🔗 Open Listing", jobUrl);
    }

    // TODO: Auto Apply — future feature
    if (job.source === "linkedin" && job.status === "ready") {
      keyboard.row().text("🔜 Auto Apply (coming soon)", "noop");
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

  // Mark in progress
  bot.callbackQuery(/^j:inprog:(.+)$/, async (ctx) => {
    const shortId = ctx.match![1];
    const allJobs = await jobsRepo.getJobListItems();
    const match = allJobs.find((j) => j.id.startsWith(shortId));
    if (!match) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }

    await jobsRepo.updateJob(match.id, { status: "in_progress" });
    await ctx.answerCallbackQuery("🔄 Marked as in progress!");
    await ctx.editMessageText(`🔄 <b>${match.title}</b> marked as in progress.`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("◀️ Back", "j:applied:0").text("◀️ Menu", "m:menu"),
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

  // Block company — add to blocklist and skip job
  bot.callbackQuery(/^j:block:(.+)$/, async (ctx) => {
    const shortId = ctx.match![1];
    const allJobs = await jobsRepo.getJobListItems();
    const match = allJobs.find((j) => j.id.startsWith(shortId));
    if (!match) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }

    const employer = match.employer.trim().toLowerCase();
    if (!employer) {
      await ctx.answerCallbackQuery("No employer name");
      return;
    }

    // Add to blocked keywords
    const raw = await settingsRepo.getSetting("blockedCompanyKeywords");
    let keywords: string[] = [];
    if (raw) {
      try { keywords = JSON.parse(raw); } catch { /* empty */ }
    }
    const existingSet = new Set(keywords.map((k) => k.toLowerCase()));
    if (!existingSet.has(employer)) {
      keywords.push(employer);
      await settingsRepo.setSetting("blockedCompanyKeywords", JSON.stringify(keywords));
    }

    // Skip the job
    if (match.status === "ready" || match.status === "discovered") {
      await jobsRepo.updateJob(match.id, { status: "skipped" });
    }

    await ctx.answerCallbackQuery(`🚫 ${match.employer} blocked!`);
    await ctx.editMessageText(
      `🚫 <b>${escapeHtml(match.employer)}</b> blocked.\nFuture jobs from this company will be filtered out.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("◀️ Back", `j:ready:0`).text("◀️ Menu", "m:menu"),
      },
    );
  });

  // Download PDF — with user's name in filename
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

    // Build filename from Telegram user name + employer
    const firstName = ctx.from?.first_name || "";
    const lastName = ctx.from?.last_name || "";
    const fullName = `${firstName} ${lastName}`.trim();
    const safeName = safeFilePart(fullName);
    const safeEmployer = safeFilePart(job.employer);
    const fileName = safeName && safeEmployer
      ? `${safeName}_${safeEmployer}_CV.pdf`
      : safeName
        ? `${safeName}_CV.pdf`
        : undefined;

    try {
      await ctx.replyWithDocument(new InputFile(pdfFullPath, fileName), {
        caption: `📄 ${job.title} — ${job.employer}`,
      });
    } catch {
      await ctx.reply("Failed to send PDF. File may not exist.");
    }
  });
}
