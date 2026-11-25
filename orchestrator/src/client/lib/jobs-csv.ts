import type { JobListItem } from "@shared/types";

const columns = [
  ["Job ID", "id"],
  ["Title", "title"],
  ["Employer", "employer"],
  ["Location", "location"],
  ["Status", "status"],
  ["Outcome", "outcome"],
  ["Source", "source"],
  ["Job type", "jobType"],
  ["Salary", "salary"],
  ["Score", "suitabilityScore"],
  ["Posted", "datePosted"],
  ["Deadline", "deadline"],
  ["Discovered at", "discoveredAt"],
  ["Applied at", "appliedAt"],
  ["Updated at", "updatedAt"],
  ["Job URL", "jobUrl"],
  ["Application URL", "applicationLink"],
] as const satisfies readonly (readonly [string, keyof JobListItem])[];

function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value);
  // Quoting alone does not stop spreadsheet applications evaluating formulas.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Spreadsheet formula prefixes can follow control characters.
  if (typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/.test(text))
    text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Fixed, public list fields only; never serialize complete Job objects. */
export function serializeJobsCsv(jobs: readonly JobListItem[]): string {
  const rows = [columns.map(([label]) => csvCell(label)).join(",")];
  for (const job of jobs)
    rows.push(columns.map(([, key]) => csvCell(job[key])).join(","));
  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

export function downloadJobsCsv(
  jobs: readonly JobListItem[],
  scope: "filtered" | "selected",
): void {
  if (jobs.length === 0) return;
  const blob = new Blob([serializeJobsCsv(jobs)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const revoke = URL.revokeObjectURL.bind(URL);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = `jobops-jobs-${new Date().toISOString().slice(0, 10)}-${scope}.csv`;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Leave the object URL alive while the browser starts the download.
    window.setTimeout(() => revoke(url), 60_000);
  }
}
