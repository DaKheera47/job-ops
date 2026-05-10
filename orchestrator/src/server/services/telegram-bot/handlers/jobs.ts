import { join } from "node:path";
import { InlineKeyboard } from "grammy";
import type { Bot, CallbackQueryContext, Context } from "grammy";
import { InputFile } from "grammy";
import type { JobStatus } from "@shared/types";
import * as jobsRepo from "../../../repositories/jobs";
import * as settingsRepo from "../../../repositories/settings";
import { getDataDir } from "../../../config/dataDir";
import { safeFilePart } from "../../pdf-storage";
import { generateCoverLetterPdf } from "../../cover-letter-pdf";
import { generateReferralMessage } from "../../referral-message";
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

    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) {
      await ctx.editMessageText("Job not found.");
      return;
    }

    const job = await jobsRepo.getJobById(fullId);
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

    if (
      job.status === "applied" ||
      job.status === "in_progress" ||
      job.status === "skipped"
    ) {
      keyboard.text("🗑 Delete Job", `j:del:${sid}`);
      keyboard.row();
    }

    if (job.pdfPath) {
      keyboard.text("📄 Download PDF", `j:pdf:${sid}`);
    }

    if (
      job.status === "ready" ||
      job.status === "applied" ||
      job.status === "in_progress"
    ) {
      keyboard.row();
      keyboard.text("📝 Cover Letter", `j:cl:${sid}`);
      keyboard.text("🤝 Ask for Referral", `j:rr:${sid}`);
    }

    if (jobUrl) {
      keyboard.url("🔗 Open Listing", jobUrl);
    }

    // TODO: Auto Apply — future feature
    if (job.source === "linkedin" && job.status === "ready") {
      keyboard.row().text("🔜 Auto Apply (coming soon)", "noop");
    }

    keyboard.row()
      .text("📋 Jobs", `j:${job.status}:0`)
      .text("📊 Stats", "s:stats")
      .text("⚙️ Settings", "x:menu");
    keyboard.row().text("◀️ Menu", "m:menu");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Mark applied
  bot.callbackQuery(/^j:apply:(.+)$/, async (ctx) => {
    const shortId = ctx.match![1];
    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }
    const match = await jobsRepo.getJobById(fullId);
    if (!match) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }

    await jobsRepo.updateJob(match.id, {
      status: "applied",
      appliedAt: new Date().toISOString(),
    });
    await ctx.answerCallbackQuery("✅ Marked as applied!");
    await ctx.editMessageText(`✅ <b>${escapeHtml(match.title)}</b> marked as applied!`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("◀️ Back", "j:ready:0").text("◀️ Menu", "m:menu"),
    });
  });

  // Mark in progress
  bot.callbackQuery(/^j:inprog:(.+)$/, async (ctx) => {
    const shortId = ctx.match![1];
    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }
    const match = await jobsRepo.getJobById(fullId);
    if (!match) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }

    await jobsRepo.updateJob(match.id, { status: "in_progress" });
    await ctx.answerCallbackQuery("🔄 Marked as in progress!");
    await ctx.editMessageText(`🔄 <b>${escapeHtml(match.title)}</b> marked as in progress.`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("◀️ Back", "j:applied:0").text("◀️ Menu", "m:menu"),
    });
  });

  // Skip job
  bot.callbackQuery(/^j:skip:(.+)$/, async (ctx) => {
    const shortId = ctx.match![1];
    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }
    const match = await jobsRepo.getJobById(fullId);
    if (!match) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }

    await jobsRepo.updateJob(match.id, { status: "skipped" });
    await ctx.answerCallbackQuery("⏭ Skipped!");
    await ctx.editMessageText(`⏭ <b>${escapeHtml(match.title)}</b> skipped.`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("◀️ Back", "j:ready:0").text("◀️ Menu", "m:menu"),
    });
  });

  // Block company — confirm step (destructive: adds to blocklist + skips job)
  bot.callbackQuery(/^j:block:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const shortId = ctx.match![1];
    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) {
      await ctx.editMessageText("Job not found.");
      return;
    }
    const match = await jobsRepo.getJobById(fullId);
    if (!match) {
      await ctx.editMessageText("Job not found.");
      return;
    }

    const employer = match.employer.trim();
    if (!employer) {
      await ctx.answerCallbackQuery("No employer name").catch(() => {});
      return;
    }

    const keyboard = new InlineKeyboard()
      .text("🚫 Yes, block", `j:blockc:${shortId}`)
      .text("◀️ Cancel", `j:d:${shortId}`);

    await ctx.editMessageText(
      `🚫 <b>Block ${escapeHtml(employer)}?</b>\n\n` +
        `Future jobs from this company will be filtered out during pipeline discovery, and this job will be skipped.\n\n` +
        `<i>You can unblock later in Settings → Blocked Companies.</i>`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  // Block company — confirmed
  bot.callbackQuery(/^j:blockc:(.+)$/, async (ctx) => {
    const shortId = ctx.match![1];
    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }
    const match = await jobsRepo.getJobById(fullId);
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
    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) return;

    const job = await jobsRepo.getJobById(fullId);
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

  // Cover Letter — generate PDF on demand and send to chat
  const handleCoverLetter = async (
    ctx: CallbackQueryContext<Context>,
    shortId: string,
    forceRegenerate: boolean,
  ): Promise<void> => {
    await ctx.answerCallbackQuery(
      forceRegenerate ? "Regenerating..." : "Generating...",
    );
    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) {
      await ctx.reply("Job not found.");
      return;
    }
    const job = await jobsRepo.getJobById(fullId);
    if (!job) {
      await ctx.reply("Job not found.");
      return;
    }

    const progressMessage = await ctx.reply(
      forceRegenerate
        ? "🔄 Regenerating cover letter…"
        : "⏳ Generating cover letter…",
    );

    const result = await generateCoverLetterPdf(job, { forceRegenerate });

    if (!result.success || !result.pdfPath) {
      await ctx.api.editMessageText(
        progressMessage.chat.id,
        progressMessage.message_id,
        `❌ Failed to generate cover letter: ${escapeHtml(result.error ?? "Unknown error")}`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const firstName = ctx.from?.first_name || "";
    const lastName = ctx.from?.last_name || "";
    const safeName = safeFilePart(`${firstName} ${lastName}`.trim());
    const safeEmployer = safeFilePart(job.employer);
    const fileName =
      safeName && safeEmployer
        ? `${safeName}_${safeEmployer}_CoverLetter.pdf`
        : "CoverLetter.pdf";

    try {
      await ctx.replyWithDocument(new InputFile(result.pdfPath, fileName), {
        caption: `📝 Cover letter — ${job.employer}`,
        reply_markup: new InlineKeyboard().text(
          "🔄 Regenerate Cover Letter",
          `j:clr:${shortId}`,
        ),
      });
      await ctx.api.deleteMessage(
        progressMessage.chat.id,
        progressMessage.message_id,
      );
    } catch (err) {
      await ctx.api.editMessageText(
        progressMessage.chat.id,
        progressMessage.message_id,
        `❌ Failed to send cover letter: ${escapeHtml(
          err instanceof Error ? err.message : String(err),
        )}`,
        { parse_mode: "HTML" },
      );
    }
  };

  bot.callbackQuery(/^j:cl:(.+)$/, async (ctx) => {
    await handleCoverLetter(ctx, ctx.match![1], false);
  });

  bot.callbackQuery(/^j:clr:(.+)$/, async (ctx) => {
    await handleCoverLetter(ctx, ctx.match![1], true);
  });

  // Referral Request — generate a fresh LinkedIn outreach message tied to JD + profile
  const handleReferralMessage = async (
    ctx: CallbackQueryContext<Context>,
    shortId: string,
  ): Promise<void> => {
    await ctx.answerCallbackQuery("Generating...");
    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) {
      await ctx.reply("Job not found.");
      return;
    }
    const job = await jobsRepo.getJobById(fullId);
    if (!job) {
      await ctx.reply("Job not found.");
      return;
    }

    const progressMessage = await ctx.reply(
      "✍️ Drafting referral message…",
    );

    const result = await generateReferralMessage(job);
    if (!result.success || !result.text) {
      await ctx.api.editMessageText(
        progressMessage.chat.id,
        progressMessage.message_id,
        `❌ Failed to generate referral message: ${escapeHtml(result.error ?? "Unknown error")}`,
        { parse_mode: "HTML" },
      );
      return;
    }

    const keyboard = new InlineKeyboard().text(
      "🔄 Regenerate",
      `j:rr:${shortId}`,
    );

    await ctx.api.editMessageText(
      progressMessage.chat.id,
      progressMessage.message_id,
      `🤝 <b>Referral request for ${escapeHtml(job.employer)}</b> (tap to copy, then replace [Name]):\n<pre>${escapeHtml(result.text)}</pre>`,
      {
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
        reply_markup: keyboard,
      },
    );
  };

  bot.callbackQuery(/^j:rr:(.+)$/, async (ctx) => {
    await handleReferralMessage(ctx, ctx.match![1]);
  });

  // Delete job — confirmation step
  bot.callbackQuery(/^j:del:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const shortId = ctx.match![1];
    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) {
      await ctx.editMessageText("Job not found.");
      return;
    }
    const job = await jobsRepo.getJobById(fullId);
    if (!job) {
      await ctx.editMessageText("Job not found.");
      return;
    }

    const keyboard = new InlineKeyboard()
      .text("✅ Yes, delete", `j:delc:${shortId}`)
      .text("◀️ Cancel", `j:d:${shortId}`);

    await ctx.editMessageText(
      `🗑 <b>Delete this job?</b>\n\n<b>${escapeHtml(job.title)}</b> @ ${escapeHtml(job.employer)}\n\n<i>This permanently removes the job and all related data (notes, interviews, chat history). Cannot be undone.</i>`,
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });

  // Delete job — confirmed
  bot.callbackQuery(/^j:delc:(.+)$/, async (ctx) => {
    const shortId = ctx.match![1];
    const fullId = await jobsRepo.getJobIdByShortId(shortId);
    if (!fullId) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }
    const job = await jobsRepo.getJobById(fullId);
    if (!job) {
      await ctx.answerCallbackQuery("Job not found");
      return;
    }

    const previousStatus = job.status;
    const deleted = await jobsRepo.deleteJob(fullId);
    if (!deleted) {
      await ctx.answerCallbackQuery("Failed to delete");
      return;
    }

    await ctx.answerCallbackQuery("🗑 Job deleted");
    const backStatus =
      previousStatus === "applied" || previousStatus === "in_progress"
        ? previousStatus
        : "ready";
    await ctx.editMessageText(
      `🗑 <b>${escapeHtml(job.title)}</b> @ ${escapeHtml(job.employer)} deleted.`,
      {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard()
          .text("◀️ Back", `j:${backStatus}:0`)
          .text("◀️ Menu", "m:menu"),
      },
    );
  });
}
