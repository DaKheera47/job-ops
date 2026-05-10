import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "@shared/types/extractors";
import type { CreateJobInput } from "@shared/types/jobs";
import { createRateLimitedFetch } from "job-ops-shared/utils/rate-limited-fetch";
import { fetchAshbyJobs } from "./ashby";
import { fetchGreenhouseJobs } from "./greenhouse";
import { fetchLeverJobs } from "./lever";
import { fetchSmartRecruitersJobs } from "./smartrecruiters";
import { fetchWorkdayJobs } from "./workday";
import type { AtsBoardEntry } from "./types";

const PROVIDER_FETCHERS: Record<
  AtsBoardEntry["provider"],
  (slug: string, fetchImpl?: typeof fetch) => Promise<CreateJobInput[]>
> = {
  greenhouse: fetchGreenhouseJobs,
  ashby: fetchAshbyJobs,
  lever: fetchLeverJobs,
  workday: fetchWorkdayJobs,
  smartrecruiters: fetchSmartRecruitersJobs,
};

function parseAtsBoardSlugs(raw: string | undefined): AtsBoardEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e: unknown): e is AtsBoardEntry =>
        typeof e === "object" &&
        e !== null &&
        "provider" in e &&
        "slug" in e &&
        typeof (e as AtsBoardEntry).provider === "string" &&
        typeof (e as AtsBoardEntry).slug === "string",
    );
  } catch {
    return [];
  }
}

export const manifest: ExtractorManifest = {
  id: "ats-boards",
  displayName: "ATS Boards (Greenhouse, Ashby, Lever, Workday, SmartRecruiters)",
  providesSources: ["greenhouse", "ashby", "lever", "workday", "smartrecruiters"],

  async run(context) {
    const entries = parseAtsBoardSlugs(context.settings.atsBoardSlugs);

    if (entries.length === 0) {
      return { success: true, jobs: [] };
    }

    // Filter entries to only those matching requested sources
    const activeEntries = entries.filter((e) =>
      context.selectedSources.includes(e.provider),
    );

    if (activeEntries.length === 0) {
      return { success: true, jobs: [] };
    }

    const allJobs: CreateJobInput[] = [];
    const seen = new Set<string>();
    const errors: string[] = [];

    for (const [index, entry] of activeEntries.entries()) {
      if (context.shouldCancel?.()) break;

      context.onProgress?.({
        phase: "list",
        termsProcessed: index,
        termsTotal: activeEntries.length,
        currentUrl: `${entry.provider}:${entry.slug}`,
        detail: `Scanning ${entry.provider}: ${entry.slug}`,
      } satisfies ExtractorProgressEvent);

      try {
        const fetcher = PROVIDER_FETCHERS[entry.provider];
        const rateLimitedFetch = createRateLimitedFetch(entry.provider);
        const jobs = await fetcher(entry.slug, rateLimitedFetch);

        for (const job of jobs) {
          const key = job.jobUrl || `${job.source}:${job.sourceJobId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allJobs.push(job);
        }
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        errors.push(`${entry.provider}:${entry.slug}: ${msg}`);
      }
    }

    context.onProgress?.({
      phase: "list",
      termsProcessed: activeEntries.length,
      termsTotal: activeEntries.length,
      detail: `ATS Boards: found ${allJobs.length} jobs from ${activeEntries.length} boards`,
    } satisfies ExtractorProgressEvent);

    return {
      success: true,
      jobs: allJobs,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  },
};

export default manifest;
