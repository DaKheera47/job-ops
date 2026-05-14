import { logger } from "@infra/logger";
import { InlineKeyboard } from "grammy";
import type { Bot } from "grammy";
import { getInsightsReport } from "../../../services/insights";
import { escapeHtml } from "../formatting";

const WINDOW_OPTIONS: Array<{ key: string; label: string; days: number }> = [
  { key: "7", label: "7d", days: 7 },
  { key: "30", label: "30d", days: 30 },
  { key: "90", label: "90d", days: 90 },
];

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

function formatInsightsMessage(
  report: Awaited<ReturnType<typeof getInsightsReport>>,
): string {
  const lines: string[] = [];
  lines.push(`<b>📊 Insights — last ${report.windowDays} days</b>`);
  lines.push("");

  // Pipeline funnel
  const f = report.pipelineFunnel;
  if (f.runs > 0) {
    lines.push("<b>🔄 Pipeline funnel</b>");
    lines.push(
      `Searched: ${f.searched} → Live: ${Math.max(0, f.searched - f.livenessFiltered)} → ` +
        `New: ${Math.max(0, f.searched - f.livenessFiltered - f.deduplicated)} → ` +
        `Scored: ${f.scored} → Selected: ${f.selected}`,
    );
    if (f.deduplicated > 0)
      lines.push(`<i>Skipped duplicates: ${f.deduplicated}</i>`);
    if (f.livenessFiltered > 0)
      lines.push(`<i>Filtered dead URLs: ${f.livenessFiltered}</i>`);
    if (f.autoSkipped > 0)
      lines.push(`<i>Auto-skipped (low score): ${f.autoSkipped}</i>`);
    if (f.ghostFlagged > 0)
      lines.push(`<i>👻 Ghost-flagged: ${f.ghostFlagged}</i>`);
    if (f.expired > 0) lines.push(`<i>Expired: ${f.expired}</i>`);
    lines.push("");
  }

  // Application status
  const t = report.totals;
  lines.push("<b>📋 Activity</b>");
  lines.push(
    `Applied: ${t.appliedAt} · In progress: ${t.inProgressAt} · Ready: ${t.readyAt}`,
  );
  lines.push(
    `Discovered: ${t.discoveredAt} · Skipped: ${t.skippedAt} · Expired: ${t.expiredAt}`,
  );
  lines.push("");

  // Conversion
  if (report.conversion[0]?.count > 0) {
    lines.push("<b>🎯 Conversion</b>");
    const stages = [
      { stage: "applied", label: "Applied" },
      { stage: "recruiter_screen", label: "Recruiter screen" },
      { stage: "technical_interview", label: "Technical" },
      { stage: "onsite", label: "Onsite" },
      { stage: "offer", label: "Offer" },
    ];
    for (const { stage, label } of stages) {
      const c = report.conversion.find((cc) => cc.stage === stage);
      if (!c) continue;
      const pct = c.stage === "applied" ? "" : ` (${formatPercent(c.rate)})`;
      lines.push(`• ${label}: ${c.count}${pct}`);
    }
    lines.push("");
  }

  // Score bands
  const significantBands = report.scoreBands.filter((b) => b.applied > 0);
  if (significantBands.length > 0) {
    lines.push("<b>📈 Response by score band</b>");
    for (const band of significantBands) {
      lines.push(
        `• ${band.band}: ${band.responded}/${band.applied} (${formatPercent(band.rate)})`,
      );
    }
    lines.push("");
  }

  // Top missing skills
  if (report.topMissingSkills.length > 0) {
    lines.push("<b>📚 Most-missing skills</b>");
    for (const item of report.topMissingSkills.slice(0, 5)) {
      lines.push(
        `• ${escapeHtml(item.skill)} — missing in ${item.appearedIn} jobs`,
      );
    }
    lines.push("");
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push("<b>💡 Recommendations</b>");
    for (const rec of report.recommendations) {
      lines.push(rec);
    }
  }

  return lines.join("\n");
}

export function registerInsightsHandlers(bot: Bot): void {
  bot.command("insights", async (ctx) => {
    try {
      const report = await getInsightsReport({ windowDays: 30 });
      await ctx.reply(formatInsightsMessage(report), {
        parse_mode: "HTML",
        reply_markup: insightsKeyboard("30"),
      });
    } catch (err) {
      logger.error("Insights command error", {
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.reply("❌ Failed to compute insights. Try again.");
    }
  });

  bot.callbackQuery(/^i:w:(7|30|90)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const key = ctx.match![1] as "7" | "30" | "90";
    const window = WINDOW_OPTIONS.find((w) => w.key === key);
    if (!window) return;
    try {
      const report = await getInsightsReport({ windowDays: window.days });
      await ctx.editMessageText(formatInsightsMessage(report), {
        parse_mode: "HTML",
        reply_markup: insightsKeyboard(key),
      });
    } catch (err) {
      logger.error("Insights callback error", {
        error: err instanceof Error ? err.message : String(err),
      });
      await ctx.answerCallbackQuery("❌ Error").catch(() => {});
    }
  });
}

function insightsKeyboard(active: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const opt of WINDOW_OPTIONS) {
    const label = opt.key === active ? `• ${opt.label} •` : opt.label;
    kb.text(label, `i:w:${opt.key}`);
  }
  kb.row().text("◀️ Menu", "m:menu");
  return kb;
}
