/**
 * Telegram handlers for Smart Apply.
 *
 * Callback IDs (all under the "sa:" namespace):
 *   sa:start:<short_job_id>   — kick off a Smart Apply session for a job
 *   sa:status:<session_id>    — re-render current status of a session
 *   sa:abort:<session_id>     — abort an in-flight session
 *
 * UX flow on the user side:
 *   1. Tap job → see "🚀 Smart Apply" button (only for eligible jobs).
 *   2. Tap button → bot replies with a status card ("⏳ Preparing…").
 *   3. Bot polls status every 3s for up to 90s; when 'ready', the message
 *      becomes a big "🌐 Open the form" button linking to the noVNC viewer.
 *   4. User opens the viewer (works on mobile), reviews + clicks Submit
 *      themselves in the rendered browser.
 *   5. The session's URL watcher flips status → 'submitted'; we update the
 *      status card with a success message.
 */

import { logger } from "@infra/logger";
import { InlineKeyboard, type Bot, type Context } from "grammy";
import * as jobsRepo from "@server/repositories/jobs";
import {
  abortSmartApplySession,
  getSmartApplySession,
  isSmartApplyEligible,
  startSmartApplySession,
} from "@server/services/smart-apply";
import { escapeHtml } from "../formatting";

const POLL_INTERVAL_MS = 3_000;
const POLL_DEADLINE_MS = 90_000;

function shortJobId(jobId: string): string {
  return jobId.slice(0, 8);
}

/**
 * Public re-export: callers (e.g. job detail handler) need to know whether
 * to render the "🚀 Smart Apply" button at all.  We expose a job → boolean
 * helper so they don't need to import the service module directly.
 */
export async function jobSupportsSmartApply(jobId: string): Promise<boolean> {
  const job = await jobsRepo.getJobById(jobId);
  if (!job) return false;
  // Only meaningful for jobs that are at least "ready" (have a tailored PDF).
  if (job.status !== "ready" && job.status !== "applied" && job.status !== "in_progress") {
    return false;
  }
  return isSmartApplyEligible({ job });
}

function buildPublicBaseUrl(): string {
  return (
    process.env.JOBOPS_PUBLIC_BASE_URL?.trim() ||
    "http://localhost:3005"
  );
}

function buildViewerAbsoluteUrl(viewerPath: string): string {
  const base = buildPublicBaseUrl();
  // Viewer path starts with "/challenge-viewer/...".  Ensure single slash.
  if (viewerPath.startsWith("http")) return viewerPath;
  return `${base.replace(/\/$/, "")}${viewerPath.startsWith("/") ? "" : "/"}${viewerPath}`;
}

function renderStatusCard(args: {
  jobTitle: string;
  employer: string;
  status:
    | "preparing"
    | "ready"
    | "submitted"
    | "expired"
    | "aborted"
    | "failed";
  viewerUrl: string | null;
  reviewRequiredCount: number;
  errorMessage: string | null;
  expiresAt: number | null;
  sessionId: string;
}): { text: string; keyboard: InlineKeyboard } {
  const header = `<b>🚀 Smart Apply</b>\n<b>${escapeHtml(args.jobTitle)}</b> @ ${escapeHtml(args.employer)}\n`;
  const lines: string[] = [header];

  switch (args.status) {
    case "preparing":
      lines.push(
        "⏳ Opening the form in our server browser and pre-filling everything we can…",
      );
      lines.push("");
      lines.push(
        "<i>Usually takes 10–30 seconds.  You'll get a viewer link as soon as it's ready.</i>",
      );
      break;
    case "ready": {
      const minutesLeft = args.expiresAt
        ? Math.max(1, Math.round((args.expiresAt - Date.now()) / 60_000))
        : null;
      lines.push("✅ Form is open and pre-filled.");
      if (args.reviewRequiredCount > 0) {
        lines.push(
          `⚠️ <b>${args.reviewRequiredCount}</b> required field(s) need your review before submit.`,
        );
      } else {
        lines.push("All required fields filled — review and submit.");
      }
      if (minutesLeft !== null) {
        lines.push("");
        lines.push(
          `<i>Viewer expires in ~${minutesLeft} min.  If you need more time, restart the session.</i>`,
        );
      }
      break;
    }
    case "submitted":
      lines.push("🎉 <b>Submission detected!</b>");
      lines.push(
        "Job moved to <b>applied</b> automatically.  Confirmation email will be picked up by Gmail sync.",
      );
      break;
    case "expired":
      lines.push(
        "⌛ The session expired.  Start a new one to reopen the form.",
      );
      break;
    case "aborted":
      lines.push("⏹ Session aborted.");
      break;
    case "failed":
      lines.push("❌ Could not prepare the form.");
      if (args.errorMessage) {
        lines.push("");
        lines.push(`<code>${escapeHtml(args.errorMessage.slice(0, 400))}</code>`);
      }
      break;
  }

  const keyboard = new InlineKeyboard();
  if (args.status === "ready" && args.viewerUrl) {
    keyboard
      .url("🌐 Open the form", buildViewerAbsoluteUrl(args.viewerUrl))
      .row()
      .text("🔄 Refresh status", `sa:status:${args.sessionId}`)
      .text("⏹ Abort", `sa:abort:${args.sessionId}`);
  } else if (args.status === "preparing") {
    keyboard
      .text("🔄 Refresh", `sa:status:${args.sessionId}`)
      .text("⏹ Abort", `sa:abort:${args.sessionId}`);
  } else if (
    args.status === "expired" ||
    args.status === "failed" ||
    args.status === "aborted"
  ) {
    keyboard.text("◀️ Menu", "m:menu");
  } else {
    keyboard
      .text("📋 Applied", "j:applied:0")
      .text("◀️ Menu", "m:menu");
  }

  return { text: lines.join("\n"), keyboard };
}

async function renderSession(
  ctx: Context,
  sessionId: string,
): Promise<void> {
  const session = await getSmartApplySession(sessionId);
  if (!session) {
    await ctx.editMessageText("Smart Apply session not found.").catch(() => {});
    return;
  }
  const job = await jobsRepo.getJobById(session.jobId);
  const card = renderStatusCard({
    jobTitle: job?.title ?? "Job",
    employer: job?.employer ?? "Company",
    status: session.status,
    viewerUrl: session.viewerUrl,
    reviewRequiredCount: session.prefilled?.reviewRequiredCount ?? 0,
    errorMessage: session.errorMessage,
    expiresAt: session.viewerExpiresAt,
    sessionId: session.id,
  });
  try {
    await ctx.editMessageText(card.text, {
      parse_mode: "HTML",
      reply_markup: card.keyboard,
      link_preview_options: { is_disabled: true },
    });
  } catch {
    await ctx.reply(card.text, {
      parse_mode: "HTML",
      reply_markup: card.keyboard,
      link_preview_options: { is_disabled: true },
    });
  }
}

async function startAndPoll(
  ctx: Context,
  jobShortId: string,
): Promise<void> {
  const jobId = await jobsRepo.getJobIdByShortId(jobShortId);
  if (!jobId) {
    await ctx
      .answerCallbackQuery("Job not found.")
      .catch(() => {});
    return;
  }

  const result = await startSmartApplySession({ jobId });
  if (!result.ok) {
    await ctx
      .answerCallbackQuery(result.message.slice(0, 200))
      .catch(() => {});
    await ctx
      .reply(`❌ Smart Apply: ${escapeHtml(result.message)}`, {
        parse_mode: "HTML",
      })
      .catch(() => {});
    return;
  }

  // Initial status card.
  const job = await jobsRepo.getJobById(jobId);
  const card = renderStatusCard({
    jobTitle: job?.title ?? "Job",
    employer: job?.employer ?? "Company",
    status: result.session.status,
    viewerUrl: result.session.viewerUrl,
    reviewRequiredCount: 0,
    errorMessage: null,
    expiresAt: result.session.viewerExpiresAt,
    sessionId: result.session.id,
  });

  let messageId: number | null = null;
  try {
    const reply = await ctx.reply(card.text, {
      parse_mode: "HTML",
      reply_markup: card.keyboard,
      link_preview_options: { is_disabled: true },
    });
    messageId = reply.message_id;
  } catch (err) {
    logger.warn("Smart Apply: failed to send initial card", { error: err });
    return;
  }
  if (!ctx.chat || messageId == null) return;
  const chatId = ctx.chat.id;
  const finalMessageId = messageId;

  // Background poller: edits the message in-place until terminal status.
  const deadline = Date.now() + POLL_DEADLINE_MS;
  const intervalHandle = setInterval(async () => {
    const session = await getSmartApplySession(result.session.id);
    if (!session) {
      clearInterval(intervalHandle);
      return;
    }
    const next = renderStatusCard({
      jobTitle: job?.title ?? "Job",
      employer: job?.employer ?? "Company",
      status: session.status,
      viewerUrl: session.viewerUrl,
      reviewRequiredCount: session.prefilled?.reviewRequiredCount ?? 0,
      errorMessage: session.errorMessage,
      expiresAt: session.viewerExpiresAt,
      sessionId: session.id,
    });
    await ctx.api
      .editMessageText(chatId, finalMessageId, next.text, {
        parse_mode: "HTML",
        reply_markup: next.keyboard,
        link_preview_options: { is_disabled: true },
      })
      .catch(() => {});

    if (
      session.status === "ready" ||
      session.status === "submitted" ||
      session.status === "failed" ||
      session.status === "expired" ||
      session.status === "aborted"
    ) {
      clearInterval(intervalHandle);
    } else if (Date.now() > deadline) {
      clearInterval(intervalHandle);
    }
  }, POLL_INTERVAL_MS);
}

export function registerSmartApplyHandlers(bot: Bot): void {
  bot.callbackQuery(/^sa:start:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery("Starting Smart Apply…").catch(() => {});
    const jobShortId = ctx.match![1];
    await startAndPoll(ctx, jobShortId);
  });

  bot.callbackQuery(/^sa:status:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const sessionId = ctx.match![1];
    await renderSession(ctx, sessionId);
  });

  bot.callbackQuery(/^sa:abort:(.+)$/, async (ctx) => {
    const sessionId = ctx.match![1];
    try {
      await abortSmartApplySession(sessionId);
      await ctx.answerCallbackQuery("⏹ Aborted").catch(() => {});
      await renderSession(ctx, sessionId);
    } catch (err) {
      logger.error("Smart Apply: abort failed", { error: err });
      await ctx
        .answerCallbackQuery("❌ Abort failed")
        .catch(() => {});
    }
  });
}
