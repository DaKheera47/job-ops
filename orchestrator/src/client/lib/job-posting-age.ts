import { formatDate, formatDateTime } from "@/lib/utils";

export interface PostingAgeLabel {
  label: string;
  inlineLabel: string;
  tooltip: string;
  tone: PostingAgeTone;
}

export type PostingAgeTone = "fresh" | "aging" | "old";

const RELATIVE_SOURCE_PATTERN =
  /\b(ago|today|yesterday|minute|hour|day|week|month|year)s?\b/i;

function parsePostingDate(value: string): Date | null {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getCalendarAgeDays(date: Date, now: Date): number {
  return Math.max(
    0,
    Math.floor(
      (startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) /
        86_400_000,
    ),
  );
}

function getPostingAgeTone(ageDays: number | null): PostingAgeTone {
  if (ageDays === null) return "old";
  if (ageDays <= 4) return "fresh";
  if (ageDays <= 14) return "aging";
  return "old";
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

  return now.getTime() - ageDays * 86_400_000;
}

function plural(value: number, unit: string): string {
  return `${value}${unit}`;
}

function formatRelativePostingAge(date: Date, now: Date): string {
  const elapsedMs = Math.max(0, now.getTime() - date.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  const elapsedHours = Math.floor(elapsedMs / 3_600_000);
  const calendarDays = getCalendarAgeDays(date, now);

  if (elapsedMinutes < 1) return "just now";
  if (elapsedMinutes < 60) return plural(elapsedMinutes, "m ago");
  if (calendarDays === 0 && elapsedHours < 24) {
    return plural(elapsedHours, "h ago");
  }
  if (calendarDays === 0) return "today";
  if (calendarDays === 1) return "yesterday";
  if (calendarDays < 7) return plural(calendarDays, "d ago");
  if (calendarDays < 30) return plural(Math.floor(calendarDays / 7), "w ago");
  if (calendarDays < 365) {
    return plural(Math.floor(calendarDays / 30), "mo ago");
  }
  return plural(Math.floor(calendarDays / 365), "y ago");
}

export function formatPostingAgeLabel(
  datePosted: string | null | undefined,
  now = new Date(),
): PostingAgeLabel | null {
  const raw = datePosted?.trim();
  if (!raw) return null;

  const parsed = parsePostingDate(raw);
  if (!parsed) {
    if (!RELATIVE_SOURCE_PATTERN.test(raw) || raw.length > 48) return null;
    const ageDays = parseRelativeAgeDays(raw);
    return {
      label: raw,
      inlineLabel: `Posted ${raw}`,
      tooltip: `Source reported: ${raw}`,
      tone: getPostingAgeTone(ageDays),
    };
  }

  const label = formatRelativePostingAge(parsed, now);
  const ageDays = getCalendarAgeDays(parsed, now);
  const absolute =
    raw.length === 10
      ? (formatDate(raw) ?? raw)
      : (formatDateTime(parsed.toISOString()) ?? raw);

  return {
    label,
    inlineLabel: `Posted ${label}`,
    tooltip: `Source posting date: ${absolute}`,
    tone: getPostingAgeTone(ageDays),
  };
}
