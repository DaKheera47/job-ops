import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSearchTerms } from "job-ops-shared/utils/search-terms";
import { runHiringCafe } from "./run.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEARCH_TERM = "web developer";
const DEFAULT_MAX_JOBS_PER_TERM = 200;

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = input ? Number.parseInt(input, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseStringArray(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed.filter((value): value is string => typeof value === "string");
  } catch {
    return undefined;
  }
}

function parseWorkplaceTypes(
  raw: string | undefined,
): Array<"remote" | "hybrid" | "onsite"> | undefined {
  const parsed = parseStringArray(raw);
  if (!parsed) return undefined;

  return parsed.filter(
    (value): value is "remote" | "hybrid" | "onsite" =>
      value === "remote" || value === "hybrid" || value === "onsite",
  );
}

function emitProgress(payload: Record<string, unknown>): void {
  if (process.env.JOBOPS_EMIT_PROGRESS !== "1") return;
  console.log(`JOBOPS_PROGRESS ${JSON.stringify(payload)}`);
}

async function run(): Promise<void> {
  const outputPath =
    process.env.HIRING_CAFE_OUTPUT_JSON ||
    join(__dirname, "../storage/datasets/default/jobs.json");

  const result = await runHiringCafe({
    searchTerms: parseSearchTerms(
      process.env.HIRING_CAFE_SEARCH_TERMS,
      DEFAULT_SEARCH_TERM,
    ),
    country: process.env.HIRING_CAFE_COUNTRY,
    countryKey: process.env.HIRING_CAFE_COUNTRY,
    locations: parseStringArray(process.env.HIRING_CAFE_LOCATION_QUERY),
    workplaceTypes: parseWorkplaceTypes(
      process.env.HIRING_CAFE_WORKPLACE_TYPES,
    ),
    locationRadiusMiles: parsePositiveInt(
      process.env.HIRING_CAFE_LOCATION_RADIUS_MILES,
      50,
    ),
    maxJobsPerTerm: parsePositiveInt(
      process.env.HIRING_CAFE_MAX_JOBS_PER_TERM,
      DEFAULT_MAX_JOBS_PER_TERM,
    ),
    onProgress: (event) => {
      emitProgress({
        event: event.type,
        termIndex: event.termIndex,
        termTotal: event.termTotal,
        searchTerm: event.searchTerm,
        pageNo: "pageNo" in event ? event.pageNo : undefined,
        resultsOnPage:
          "resultsOnPage" in event ? event.resultsOnPage : undefined,
        totalCollected:
          "totalCollected" in event ? event.totalCollected : undefined,
        jobsFoundTerm:
          "jobsFoundTerm" in event ? event.jobsFoundTerm : undefined,
      });
    },
  });

  if (!result.success) {
    throw new Error(result.error ?? "Hiring Cafe extractor failed");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result.jobs, null, 2)}\n`);
  console.log(`Hiring Cafe extractor wrote ${result.jobs.length} jobs`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Hiring Cafe extractor failed: ${message}`);
  process.exitCode = 1;
});
