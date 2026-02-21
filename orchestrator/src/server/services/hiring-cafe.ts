import { spawn, spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { normalizeCountryKey } from "@shared/location-support.js";
import {
  matchesRequestedCity,
  parseSearchCitiesSetting,
  shouldApplyStrictCityFilter,
} from "@shared/search-cities.js";
import type { CreateJobInput } from "@shared/types";
import { toNumberOrNull, toStringOrNull } from "@shared/utils/type-conversion";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HIRING_CAFE_DIR = join(__dirname, "../../../../extractors/hiringcafe");
const DATASET_PATH = join(
  HIRING_CAFE_DIR,
  "storage/datasets/default/jobs.json",
);
const STORAGE_DATASET_DIR = join(HIRING_CAFE_DIR, "storage/datasets/default");
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";

const require = createRequire(import.meta.url);
const TSX_CLI_PATH = resolveTsxCliPath();

type HiringCafeRawJob = Record<string, unknown>;

export type HiringCafeProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "page_fetched";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      pageNo: number;
      resultsOnPage: number;
      totalCollected: number;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export interface RunHiringCafeOptions {
  searchTerms?: string[];
  country?: string;
  countryKey?: string;
  locations?: string[];
  locationRadiusMiles?: number;
  maxJobsPerTerm?: number;
  onProgress?: (event: HiringCafeProgressEvent) => void;
}

export interface HiringCafeResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

export function shouldApplyStrictLocationFilter(
  location: string,
  countryKey: string,
): boolean {
  return shouldApplyStrictCityFilter(location, countryKey);
}

export function matchesRequestedLocation(
  jobLocation: string | undefined,
  requestedLocation: string,
): boolean {
  return matchesRequestedCity(jobLocation, requestedLocation);
}

function resolveLocations(options: RunHiringCafeOptions): string[] {
  const raw = options.locations?.length
    ? options.locations
    : parseSearchCitiesSetting(process.env.HIRING_CAFE_LOCATION_QUERY ?? "");
  return raw.map((value) => value.trim()).filter(Boolean);
}

function resolveTsxCliPath(): string | null {
  try {
    return require.resolve("tsx/dist/cli.mjs");
  } catch {
    return null;
  }
}

function canRunNpmCommand(): boolean {
  const result = spawnSync("npm", ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function parseProgressLine(line: string): HiringCafeProgressEvent | null {
  if (!line.startsWith(JOBOPS_PROGRESS_PREFIX)) return null;

  const raw = line.slice(JOBOPS_PROGRESS_PREFIX.length).trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const event = toStringOrNull(parsed.event);
  const termIndex = toNumberOrNull(parsed.termIndex);
  const termTotal = toNumberOrNull(parsed.termTotal);
  const searchTerm = toStringOrNull(parsed.searchTerm) ?? "";

  if (!event || termIndex === null || termTotal === null) {
    return null;
  }

  if (event === "term_start") {
    return { type: "term_start", termIndex, termTotal, searchTerm };
  }

  if (event === "page_fetched") {
    const pageNo = toNumberOrNull(parsed.pageNo);
    if (pageNo === null) return null;

    return {
      type: "page_fetched",
      termIndex,
      termTotal,
      searchTerm,
      pageNo,
      resultsOnPage: toNumberOrNull(parsed.resultsOnPage) ?? 0,
      totalCollected: toNumberOrNull(parsed.totalCollected) ?? 0,
    };
  }

  if (event === "term_complete") {
    return {
      type: "term_complete",
      termIndex,
      termTotal,
      searchTerm,
      jobsFoundTerm: toNumberOrNull(parsed.jobsFoundTerm) ?? 0,
    };
  }

  return null;
}

function mapHiringCafeRow(row: HiringCafeRawJob): CreateJobInput | null {
  const jobUrl = toStringOrNull(row.jobUrl);
  if (!jobUrl) return null;

  return {
    source: "hiringcafe",
    sourceJobId: toStringOrNull(row.sourceJobId) ?? undefined,
    title: toStringOrNull(row.title) ?? "Unknown Title",
    employer: toStringOrNull(row.employer) ?? "Unknown Employer",
    jobUrl,
    applicationLink: toStringOrNull(row.applicationLink) ?? jobUrl,
    location: toStringOrNull(row.location) ?? undefined,
    salary: toStringOrNull(row.salary) ?? undefined,
    datePosted: toStringOrNull(row.datePosted) ?? undefined,
    jobDescription: toStringOrNull(row.jobDescription) ?? undefined,
    jobType: toStringOrNull(row.jobType) ?? undefined,
  };
}

async function readDataset(): Promise<CreateJobInput[]> {
  const content = await readFile(DATASET_PATH, "utf-8");
  const parsed = JSON.parse(content) as unknown;
  if (!Array.isArray(parsed)) return [];

  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();

  for (const value of parsed) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const mapped = mapHiringCafeRow(value as HiringCafeRawJob);
    if (!mapped) continue;

    const dedupeKey = mapped.sourceJobId || mapped.jobUrl;
    if (seen.has(dedupeKey)) continue;

    seen.add(dedupeKey);
    jobs.push(mapped);
  }

  return jobs;
}

async function clearStorageDataset(): Promise<void> {
  await rm(STORAGE_DATASET_DIR, { recursive: true, force: true });
  await mkdir(STORAGE_DATASET_DIR, { recursive: true });
}

export async function runHiringCafe(
  options: RunHiringCafeOptions = {},
): Promise<HiringCafeResult> {
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["web developer"];
  const country = (options.country || "united kingdom").trim().toLowerCase();
  const countryKey = normalizeCountryKey(options.countryKey ?? "");
  const maxJobsPerTerm = options.maxJobsPerTerm ?? 200;
  const locationRadiusMiles = Math.max(
    1,
    Math.floor(options.locationRadiusMiles ?? 1),
  );
  const locations = resolveLocations(options);
  const runLocations = locations.length > 0 ? locations : [null];
  const termTotal = searchTerms.length * runLocations.length;

  const useNpmCommand = canRunNpmCommand();
  if (!useNpmCommand && !TSX_CLI_PATH) {
    return {
      success: false,
      jobs: [],
      error: "Unable to execute Hiring Cafe extractor (npm/tsx unavailable)",
    };
  }

  try {
    const jobs: CreateJobInput[] = [];
    const seen = new Set<string>();

    for (let runIndex = 0; runIndex < runLocations.length; runIndex += 1) {
      const location = runLocations[runIndex];
      const strictLocationFilter =
        location !== null &&
        shouldApplyStrictLocationFilter(location, countryKey);

      await clearStorageDataset();

      await new Promise<void>((resolve, reject) => {
        const extractorEnv = {
          ...process.env,
          JOBOPS_EMIT_PROGRESS: "1",
          HIRING_CAFE_SEARCH_TERMS: JSON.stringify(searchTerms),
          HIRING_CAFE_COUNTRY: country,
          HIRING_CAFE_MAX_JOBS_PER_TERM: String(maxJobsPerTerm),
          HIRING_CAFE_OUTPUT_JSON: DATASET_PATH,
          HIRING_CAFE_LOCATION_QUERY: strictLocationFilter ? location : "",
          HIRING_CAFE_LOCATION_RADIUS_MILES: strictLocationFilter
            ? String(locationRadiusMiles)
            : "",
        };

        const child = useNpmCommand
          ? spawn("npm", ["run", "start"], {
              cwd: HIRING_CAFE_DIR,
              stdio: ["ignore", "pipe", "pipe"],
              env: extractorEnv,
            })
          : (() => {
              const tsxCliPath = TSX_CLI_PATH;
              if (!tsxCliPath) {
                throw new Error(
                  "Unable to execute Hiring Cafe extractor (npm/tsx unavailable)",
                );
              }

              return spawn(process.execPath, [tsxCliPath, "src/main.ts"], {
                cwd: HIRING_CAFE_DIR,
                stdio: ["ignore", "pipe", "pipe"],
                env: extractorEnv,
              });
            })();

        const handleLine = (line: string, stream: NodeJS.WriteStream) => {
          const progressEvent = parseProgressLine(line);
          if (progressEvent) {
            const termOffset = runIndex * searchTerms.length;
            options.onProgress?.({
              ...progressEvent,
              termIndex: termOffset + progressEvent.termIndex,
              termTotal,
            });
            return;
          }

          stream.write(`${line}\n`);
        };

        const stdoutRl = child.stdout
          ? createInterface({ input: child.stdout })
          : null;
        const stderrRl = child.stderr
          ? createInterface({ input: child.stderr })
          : null;

        stdoutRl?.on("line", (line) => handleLine(line, process.stdout));
        stderrRl?.on("line", (line) => handleLine(line, process.stderr));

        child.on("close", (code) => {
          stdoutRl?.close();
          stderrRl?.close();
          if (code === 0) resolve();
          else
            reject(new Error(`Hiring Cafe extractor exited with code ${code}`));
        });
        child.on("error", reject);
      });

      const runJobs = await readDataset();
      const filtered = strictLocationFilter
        ? runJobs.filter((job) =>
            matchesRequestedLocation(job.location, location),
          )
        : runJobs;

      for (const job of filtered) {
        const key = job.sourceJobId || job.jobUrl;
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push(job);
      }
    }

    return { success: true, jobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.warn("Hiring Cafe extractor run failed", {
      error: message,
      details: sanitizeUnknown(error),
    });
    return { success: false, jobs: [], error: message };
  }
}
