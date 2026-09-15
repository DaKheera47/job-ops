import { Buffer } from "node:buffer";
import type { CreateJobInput } from "job-ops-shared/types/jobs";
import type { UpworkApifyItem } from "./types";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/[$,\s]/g, ""));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function readPath(item: UpworkApifyItem, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    const record = asRecord(current);
    return record ? record[part] : undefined;
  }, item);
}

function firstString(
  item: UpworkApifyItem,
  paths: readonly string[],
): string | undefined {
  for (const path of paths) {
    const value = readPath(item, path);
    const direct = asString(value);
    if (direct) return direct;

    const record = asRecord(value);
    const nested =
      asString(record?.label) ??
      asString(record?.text) ??
      asString(record?.value) ??
      asString(record?.country);
    if (nested) return nested;
  }

  return undefined;
}

function firstNumber(
  item: UpworkApifyItem,
  paths: readonly string[],
): number | undefined {
  for (const path of paths) {
    const value = asNumber(readPath(item, path));
    if (value !== undefined) return value;
  }

  return undefined;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 10)),
    )
    .replace(/&#x([a-f0-9]+);/gi, (_, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    );
}

export function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  if (value.startsWith("/")) return `https://www.upwork.com${value}`;
  return value;
}

function createSourceJobId(url: string): string {
  return Buffer.from(url).toString("base64url").slice(0, 16);
}

function formatMoney(amount: number | undefined, currency?: string): string {
  if (amount === undefined) return "";
  const formatted = amount.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
  const normalizedCurrency = currency?.trim().toUpperCase();
  if (!normalizedCurrency || normalizedCurrency === "USD")
    return `$${formatted}`;
  return `${normalizedCurrency} ${formatted}`;
}

function formatRange(args: {
  min?: number;
  max?: number;
  currency?: string;
  suffix?: string;
}): string | undefined {
  if (args.min === undefined && args.max === undefined) return undefined;
  const suffix = args.suffix ?? "";
  if (args.min !== undefined && args.max !== undefined) {
    return `${formatMoney(args.min, args.currency)}-${formatMoney(
      args.max,
      args.currency,
    )}${suffix}`;
  }
  return `${formatMoney(args.min ?? args.max, args.currency)}${suffix}`;
}

function arrayText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value
    .map(
      (entry) =>
        asString(entry) ?? firstString(asRecord(entry) ?? {}, ["name"]),
    )
    .filter((entry): entry is string => Boolean(entry));
  return values.length > 0 ? values.join(", ") : undefined;
}

function normalizeJobType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[_-]+/g, " ").trim();
  if (!normalized) return undefined;
  if (/hour/i.test(normalized)) return "Hourly";
  if (/fixed/i.test(normalized)) return "Fixed Price";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function extractUpworkSalary(item: UpworkApifyItem): string | undefined {
  const direct = firstString(item, [
    "salary",
    "budget",
    "hourlyRate",
    "hourly_rate",
    "rate",
  ]);
  if (direct && /[$\d]/.test(direct)) return direct;

  const currency =
    firstString(item, [
      "currency",
      "budget.currency",
      "hourlyRange.currency",
    ]) ?? "USD";
  const budgetAmount = firstNumber(item, [
    "budget.amount",
    "budgetAmount",
    "budget_amount",
  ]);
  if (budgetAmount !== undefined) return formatMoney(budgetAmount, currency);

  const budgetRange = formatRange({
    min: firstNumber(item, ["budget.min", "budgetMin", "budget_min"]),
    max: firstNumber(item, ["budget.max", "budgetMax", "budget_max"]),
    currency,
  });
  if (budgetRange) return budgetRange;

  const hourlyRange = formatRange({
    min: firstNumber(item, [
      "hourlyRange.min",
      "hourlyRate.min",
      "hourlyRateMin",
      "hourly_rate_min",
    ]),
    max: firstNumber(item, [
      "hourlyRange.max",
      "hourlyRate.max",
      "hourlyRateMax",
      "hourly_rate_max",
    ]),
    currency,
    suffix: "/hr",
  });
  if (hourlyRange) return hourlyRange;

  return undefined;
}

export function parseUpworkItems(
  items: readonly UpworkApifyItem[],
): CreateJobInput[] {
  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    try {
      const title = firstString(item, ["title", "jobTitle", "job_title"]);
      const jobUrl = normalizeUrl(
        firstString(item, ["url", "jobUrl", "job_url", "link", "permalink"]),
      );
      if (!title || !jobUrl) continue;

      const sourceJobId =
        firstString(item, ["id", "jobId", "job_id", "ciphertext", "uid"]) ??
        createSourceJobId(jobUrl);
      const dedupeKey = sourceJobId ?? jobUrl;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const description = stripHtml(
        firstString(item, ["description", "jobDescription", "summary"]) ?? "",
      );
      const skills =
        arrayText(readPath(item, "skills")) ??
        arrayText(readPath(item, "tags"));

      jobs.push({
        source: "upwork",
        sourceJobId,
        title,
        employer:
          firstString(item, ["client.name", "clientName", "company"]) ??
          "Upwork Client",
        jobUrl,
        applicationLink:
          normalizeUrl(firstString(item, ["applicationLink", "applyUrl"])) ??
          jobUrl,
        datePosted: normalizeDate(
          firstString(item, [
            "datePosted",
            "postedDate",
            "posted_date",
            "publishedAt",
            "absoluteDate",
            "createdAt",
          ]),
        ),
        salary: extractUpworkSalary(item),
        location: firstString(item, [
          "location",
          "clientLocation",
          "clientCountry",
          "client.country",
        ]),
        jobDescription: description || undefined,
        jobType:
          normalizeJobType(
            firstString(item, [
              "jobType",
              "paymentType",
              "budgetType",
              "budget_type",
              "type",
            ]),
          ) ?? "Freelance / Contract",
        salaryMinAmount: firstNumber(item, [
          "budget.min",
          "budgetMin",
          "budget_min",
          "hourlyRange.min",
          "hourlyRate.min",
          "hourlyRateMin",
          "hourly_rate_min",
        ]),
        salaryMaxAmount: firstNumber(item, [
          "budget.max",
          "budgetMax",
          "budget_max",
          "hourlyRange.max",
          "hourlyRate.max",
          "hourlyRateMax",
          "hourly_rate_max",
        ]),
        salaryCurrency: firstString(item, [
          "currency",
          "budget.currency",
          "hourlyRange.currency",
        ]),
        salaryInterval: firstString(item, ["salaryInterval", "paymentType"]),
        skills,
        experienceRange: firstString(item, [
          "experienceLevel",
          "experience_level",
        ]),
        isRemote: true,
      });
    } catch {}
  }

  return jobs;
}
