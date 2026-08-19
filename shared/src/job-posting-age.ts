/**
 * Shared parsing for source-provided job posting dates.
 *
 * A job's `datePosted` is heterogeneous across sources: some emit an ISO-ish
 * absolute date (e.g. "2026-05-25" or "2026-05-25T09:00:00Z"), others emit a
 * relative phrase (e.g. "3 days ago", "today"). These helpers normalize both
 * shapes into a comparable epoch value so the same age logic can run on the
 * client (results list) and on the server (search-time discovery filter).
 */

const DAY_MS = 86_400_000;

function parsePostingDate(value: string): Date | null {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseRelativeAgeDays(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  if (/\btoday\b/.test(normalized)) return 0;
  if (/\byesterday\b/.test(normalized)) return 1;

  const match = /(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago\b/.exec(
    normalized,
  );
  if (!match) return null;

  const amount = Number.parseInt(match[1] ?? "", 10);
  if (!Number.isFinite(amount)) return null;

  const unit = match[2];
  if (unit === "minute" || unit === "hour") return 0;
  if (unit === "day") return amount;
  if (unit === "week") return amount * 7;
  if (unit === "month") return amount * 30;
  if (unit === "year") return amount * 365;
  return null;
}

/**
 * Resolves a posting date string to an epoch millisecond value usable for
 * sorting and age comparisons. Absolute dates parse directly; relative phrases
 * are converted to an approximate timestamp relative to `now`. Returns null
 * when the value is missing or cannot be interpreted.
 */
export function getPostingDateSortValue(
  datePosted: string | null | undefined,
  now = new Date(),
): number | null {
  const raw = datePosted?.trim();
  if (!raw) return null;

  const parsed = parsePostingDate(raw);
  if (parsed) return parsed.getTime();

  const ageDays = parseRelativeAgeDays(raw);
  if (ageDays == null) return null;

  return now.getTime() - ageDays * DAY_MS;
}

/**
 * Strict "posted within the last N days" check. Jobs with a missing or
 * unparseable posting date return false (excluded). Mirrors the results-list
 * filter semantics; the server discovery filter deliberately keeps
 * unknown-date jobs instead (see discover-jobs.ts).
 */
export function isPostedWithinDays(
  datePosted: string | null | undefined,
  days: number,
  now: number,
): boolean {
  if (!Number.isFinite(days) || days <= 0) return true;
  const posted = getPostingDateSortValue(datePosted, new Date(now));
  if (posted == null) return false;
  return posted >= now - days * DAY_MS;
}

export { parsePostingDate, parseRelativeAgeDays };
