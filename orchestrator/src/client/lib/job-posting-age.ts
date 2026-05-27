import { formatDate, formatDateTime } from "@/lib/utils";

export interface PostingAgeLabel {
  label: string;
  inlineLabel: string;
  tooltip: string;
}

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

function plural(value: number, unit: string): string {
  return `${value}${unit}`;
}

function formatRelativePostingAge(date: Date, now: Date): string {
  const elapsedMs = Math.max(0, now.getTime() - date.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  const elapsedHours = Math.floor(elapsedMs / 3_600_000);
  const calendarDays = Math.floor(
    (startOfLocalDay(now).getTime() - startOfLocalDay(date).getTime()) /
      86_400_000,
  );

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
    return {
      label: raw,
      inlineLabel: `Posted ${raw}`,
      tooltip: `Source reported: ${raw}`,
    };
  }

  const label = formatRelativePostingAge(parsed, now);
  const absolute =
    raw.length === 10
      ? (formatDate(raw) ?? raw)
      : (formatDateTime(parsed.toISOString()) ?? raw);

  return {
    label,
    inlineLabel: `Posted ${label}`,
    tooltip: `Source posting date: ${absolute}`,
  };
}
