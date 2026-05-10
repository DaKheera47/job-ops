import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import { asyncPool } from "@server/utils/async-pool";
import type { Job } from "@shared/types";

const livenessLogger = logger.child({ module: "check-liveness" });

// ---------------------------------------------------------------------------
// Body-text patterns indicating the posting is closed (multi-language)
// Ported from career-ops liveness-core.mjs
// ---------------------------------------------------------------------------

const EXPIRED_BODY_PATTERNS: RegExp[] = [
  /job (is )?no longer available/i,
  /job.*no longer open/i,
  /position has been filled/i,
  /this job has expired/i,
  /job posting has expired/i,
  /no longer accepting applications/i,
  /this (position|role|job) (is )?no longer/i,
  /this job (listing )?is closed/i,
  /job (listing )?not found/i,
  /the page you are looking for doesn.t exist/i,
  /applications?\s+(?:(?:have|are|is)\s+)?closed/i,
  /closed on \d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  /closed on (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/i,
  /diese stelle (ist )?(nicht mehr|bereits) besetzt/i,
  /offre (expirée|n'est plus disponible)/i,
];

const LISTING_PAGE_PATTERNS: RegExp[] = [
  /\d+\s+jobs?\s+found/i,
  /search for jobs page is loaded/i,
];

const MIN_CONTENT_LENGTH = 300;
const REQUEST_TIMEOUT_MS = 5000;
const CONCURRENCY = 5;

// Greenhouse job URL pattern: boards.greenhouse.io/{slug}/jobs/{id}
const GREENHOUSE_URL_RE =
  /boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/;

// ---------------------------------------------------------------------------
// Single-job liveness check
// ---------------------------------------------------------------------------

type LivenessResult = "alive" | "expired" | "uncertain";

async function checkGreenhouseLiveness(
  jobUrl: string,
): Promise<LivenessResult> {
  const match = jobUrl.match(GREENHOUSE_URL_RE);
  if (!match) return "uncertain";

  const [, slug, jobId] = match;
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`;

  const resp = await fetch(apiUrl, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: "follow",
  });

  if (resp.status === 404 || resp.status === 410) return "expired";
  if (resp.ok) return "alive";
  return "uncertain";
}

function classifyBody(bodyText: string): LivenessResult {
  for (const pattern of EXPIRED_BODY_PATTERNS) {
    if (pattern.test(bodyText)) return "expired";
  }
  for (const pattern of LISTING_PAGE_PATTERNS) {
    if (pattern.test(bodyText)) return "expired";
  }
  if (bodyText.length < MIN_CONTENT_LENGTH) return "expired";
  return "alive";
}

async function checkGenericLiveness(
  jobUrl: string,
): Promise<LivenessResult> {
  const resp = await fetch(jobUrl, {
    method: "GET",
    headers: {
      accept: "text/html",
      "user-agent":
        "Mozilla/5.0 (compatible; JobOpsLivenessBot/1.0)",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    redirect: "follow",
  });

  if (resp.status === 404 || resp.status === 410) return "expired";
  if (!resp.ok) return "uncertain";

  const body = await resp.text();
  return classifyBody(body);
}

async function checkJobLiveness(job: Job): Promise<LivenessResult> {
  if (!job.jobUrl) return "uncertain";
  if (job.source === "manual") return "uncertain";

  try {
    if (job.source === "greenhouse" && GREENHOUSE_URL_RE.test(job.jobUrl)) {
      return await checkGreenhouseLiveness(job.jobUrl);
    }
    return await checkGenericLiveness(job.jobUrl);
  } catch {
    // Network error, timeout, DNS failure — don't expire
    return "uncertain";
  }
}

// ---------------------------------------------------------------------------
// Pipeline step
// ---------------------------------------------------------------------------

interface CheckLivenessStepArgs {
  shouldCancel?: () => boolean;
}

interface CheckLivenessStepResult {
  checked: number;
  expired: number;
  errors: number;
}

export async function checkLivenessStep(
  args: CheckLivenessStepArgs,
): Promise<CheckLivenessStepResult> {
  const candidates = await jobsRepo.getAllJobs(["discovered", "ready"]);

  if (candidates.length === 0) {
    livenessLogger.info("No jobs to check for liveness");
    return { checked: 0, expired: 0, errors: 0 };
  }

  livenessLogger.info("Starting liveness check", {
    candidates: candidates.length,
  });

  let expired = 0;
  let errors = 0;

  await asyncPool({
    items: candidates,
    concurrency: CONCURRENCY,
    shouldStop: args.shouldCancel,
    task: async (job) => {
      const result = await checkJobLiveness(job);
      if (result === "expired") {
        await jobsRepo.updateJob(job.id, { status: "expired" });
        expired += 1;
        livenessLogger.info("Job expired", {
          title: job.title,
          employer: job.employer,
          source: job.source,
          jobUrl: job.jobUrl,
        });
      }
    },
    onTaskSettled: (_job, _index, outcome) => {
      if (outcome.status === "rejected") {
        errors += 1;
      }
    },
  });

  livenessLogger.info("Liveness check complete", {
    checked: candidates.length,
    expired,
    errors,
  });

  return { checked: candidates.length, expired, errors };
}
