import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { logger } from "@infra/logger";
import { normalizeCountryKey } from "@shared/location-support.js";
import {
  matchesRequestedCity,
  parseSearchCitiesSetting,
  shouldApplyStrictCityFilter,
} from "@shared/search-cities.js";
import type { CreateJobInput } from "@shared/types";
import { toNumberOrNull, toStringOrNull } from "@shared/utils/type-conversion";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADZUNA_DIR = join(__dirname, "../../../../extractors/adzuna");
const DATASET_PATH = join(ADZUNA_DIR, "storage/datasets/default/jobs.json");
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";
const require = createRequire(import.meta.url);
const TSX_CLI_PATH = resolveTsxCliPath();

type AdzunaRawJob = Record<string, unknown>;

export type AdzunaProgressEvent =
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

export interface RunAdzunaOptions {
  searchTerms?: string[];
  country?: string;
  countryKey?: string;
  locations?: string[];
  maxJobsPerTerm?: number;
  onProgress?: (event: AdzunaProgressEvent) => void;
}

export interface AdzunaResult {
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

function resolveLocations(options: RunAdzunaOptions): string[] {
  const raw = options.locations?.length
    ? options.locations
    : parseSearchCitiesSetting(process.env.ADZUNA_LOCATION_QUERY ?? "");
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

function parseAdzunaProgressLine(line: string): AdzunaProgressEvent | null {
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
  if (!event || termIndex === null || termTotal === null) return null;

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

function mapAdzunaRow(row: AdzunaRawJob): CreateJobInput | null {
  const jobUrl = toStringOrNull(row.jobUrl);
  if (!jobUrl) return null;

  return {
    source: "adzuna",
    sourceJobId: toStringOrNull(row.sourceJobId) ?? undefined,
    title: toStringOrNull(row.title) ?? "Unknown Title",
    employer: toStringOrNull(row.employer) ?? "Unknown Employer",
    jobUrl,
    applicationLink:
      toStringOrNull(row.applicationLink) ??
      toStringOrNull(row.jobUrl) ??
      undefined,
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
    if (!value || typeof value !== "object") continue;
    const mapped = mapAdzunaRow(value as AdzunaRawJob);
    if (!mapped) continue;
    const key = mapped.sourceJobId || mapped.jobUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push(mapped);
  }
  return jobs;
}

export async function runAdzuna(
  options: RunAdzunaOptions = {},
): Promise<AdzunaResult> {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) {
    return {
      success: false,
      jobs: [],
      error: "Missing Adzuna credentials (ADZUNA_APP_ID / ADZUNA_APP_KEY)",
    };
  }

  const country = (options.country || "gb").trim().toLowerCase();
  const countryKey = normalizeCountryKey(options.countryKey ?? "");
  const maxJobsPerTerm = options.maxJobsPerTerm ?? 50;
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["web developer"];
  const locations = resolveLocations(options);
  const runLocations = locations.length > 0 ? locations : [null];
  const termTotal = searchTerms.length * runLocations.length;
  const useNpmCommand = canRunNpmCommand();
  if (!useNpmCommand && !TSX_CLI_PATH) {
    return {
      success: false,
      jobs: [],
      error: "Unable to execute Adzuna extractor (npm/tsx unavailable)",
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

      await new Promise<void>((resolve, reject) => {
        const extractorEnv = {
          ...process.env,
          JOBOPS_EMIT_PROGRESS: "1",
          ADZUNA_APP_ID: appId,
          ADZUNA_APP_KEY: appKey,
          ADZUNA_COUNTRY: country,
          ADZUNA_MAX_JOBS_PER_TERM: String(maxJobsPerTerm),
          ADZUNA_SEARCH_TERMS: JSON.stringify(searchTerms),
          ADZUNA_OUTPUT_JSON: DATASET_PATH,
          ADZUNA_LOCATION_QUERY: strictLocationFilter ? location : "",
        };
        const child = useNpmCommand
          ? spawn("npm", ["run", "start"], {
              cwd: ADZUNA_DIR,
              stdio: ["ignore", "pipe", "pipe"],
              env: extractorEnv,
            })
          : (() => {
              const tsxCliPath = TSX_CLI_PATH;
              if (!tsxCliPath) {
                throw new Error(
                  "Unable to execute Adzuna extractor (npm/tsx unavailable)",
                );
              }
              return spawn(process.execPath, [tsxCliPath, "src/main.ts"], {
                cwd: ADZUNA_DIR,
                stdio: ["ignore", "pipe", "pipe"],
                env: extractorEnv,
              });
            })();

        const handleLine = (line: string, stream: NodeJS.WriteStream) => {
          const progressEvent = parseAdzunaProgressLine(line);
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
          else reject(new Error(`Adzuna extractor exited with code ${code}`));
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
    logger.warn("Adzuna extractor run failed", { error: message });
    return { success: false, jobs: [], error: message };
  }
}
