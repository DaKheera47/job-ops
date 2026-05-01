import type { Job, JobListItem, JobStatus } from "@shared/types";

const STATUS_EMOJI: Record<JobStatus, string> = {
  discovered: "🔍",
  processing: "⚙️",
  ready: "✅",
  applied: "📨",
  in_progress: "🔄",
  skipped: "⏭",
  expired: "⏰",
};

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatJobCard(job: Job): string {
  const lines: string[] = [];
  lines.push(`<b>${escapeHtml(job.title)}</b>`);
  lines.push(`🏢 ${escapeHtml(job.employer)}`);

  if (job.location) lines.push(`📍 ${escapeHtml(job.location)}`);
  if (job.salary) lines.push(`💰 ${escapeHtml(job.salary)}`);
  if (job.suitabilityScore !== null)
    lines.push(`⭐ Score: ${job.suitabilityScore}/100`);
  lines.push(`🔗 Source: ${escapeHtml(job.source)}`);
  lines.push(`${STATUS_EMOJI[job.status]} Status: ${job.status}`);
  if (job.pdfPath) lines.push("📄 PDF: Ready");

  return lines.join("\n");
}

export function formatJobListItem(job: JobListItem, index: number): string {
  const score = job.suitabilityScore !== null ? `⭐${job.suitabilityScore}` : "";
  const salary = job.salary ? `💰${job.salary}` : "";
  const parts = [
    `${index + 1}. <b>${escapeHtml(job.title)}</b>`,
    `   🏢 ${escapeHtml(job.employer)} ${score} ${salary}`.trim(),
  ];
  return parts.join("\n");
}

export function formatStats(stats: Record<JobStatus, number>): string {
  const total = Object.values(stats).reduce((sum, n) => sum + n, 0);
  const applied = stats.applied || 0;

  const lines = [
    "<b>📊 Application Funnel</b>",
    "",
    `🔍 Discovered: ${stats.discovered || 0}`,
    `✅ Ready: ${stats.ready || 0}`,
    `📨 Applied: ${applied}`,
    `🔄 In Progress: ${stats.in_progress || 0}`,
    `⏭ Skipped: ${stats.skipped || 0}`,
    "",
    `📋 Total: ${total}`,
  ];

  return lines.join("\n");
}

export function formatPipelineProgress(progress: {
  step: string;
  message: string;
  jobsDiscovered?: number;
  jobsScored?: number;
  jobsProcessed?: number;
  totalToProcess?: number;
  error?: string;
}): string {
  const lines = ["<b>🔄 Pipeline</b>", ""];

  if (progress.jobsDiscovered !== undefined)
    lines.push(
      `${progress.step === "crawling" ? "🔄" : "✅"} Discovery: ${progress.jobsDiscovered} jobs`,
    );
  if (progress.jobsScored !== undefined)
    lines.push(
      `${progress.step === "scoring" ? "🔄" : "✅"} Scored: ${progress.jobsScored}`,
    );
  if (progress.jobsProcessed !== undefined) {
    const total = progress.totalToProcess || "?";
    lines.push(
      `${progress.step === "processing" ? "🔄" : "✅"} Processed: ${progress.jobsProcessed}/${total}`,
    );
  }

  lines.push("");
  lines.push(escapeHtml(progress.message));

  if (progress.error) {
    lines.push("");
    lines.push(`❌ ${escapeHtml(progress.error)}`);
  }

  return lines.join("\n");
}

export function formatBatchProgress(progress: {
  currentIndex: number;
  totalJobs: number;
  results: Array<{ jobTitle: string; employer: string; status: string; error?: string }>;
}): string {
  const lines = [
    `<b>🚀 Batch Apply: ${progress.currentIndex + 1}/${progress.totalJobs}</b>`,
    "",
  ];

  for (const r of progress.results) {
    const icon =
      r.status === "applied" ? "✅" :
      r.status === "failed" ? "❌" :
      r.status === "manual_required" ? "⚠️" :
      r.status === "applying" ? "🔄" : "⏳";
    const err = r.error ? ` — ${escapeHtml(r.error)}` : "";
    lines.push(`${icon} ${escapeHtml(r.jobTitle)} @ ${escapeHtml(r.employer)}${err}`);
  }

  return lines.join("\n");
}
