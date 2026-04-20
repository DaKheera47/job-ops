import { randomUUID } from "node:crypto";
import {
  AppError,
  badRequest,
  notFound,
  requestTimeout,
  toAppError,
  unprocessableEntity,
} from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { processJob } from "@server/pipeline/index";
import * as jobsRepo from "@server/repositories/jobs";
import { inferManualJobDetails } from "@server/services/manualJob";
import { getProfile } from "@server/services/profile";
import { scoreJobSuitability } from "@server/services/scorer";
import type {
  Job,
  ManualJobDraft,
  ManualJobIngestionResponse,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { JSDOM } from "jsdom";
import { z } from "zod";

export const manualJobsRouter = Router();

const manualJobFetchSchema = z.object({
  url: z.string().trim().url().max(2000),
});

const manualJobInferenceSchema = z.object({
  jobDescription: z.string().trim().min(1).max(60000),
});

const manualJobImportSchema = z.object({
  job: z.object({
    title: z.string().trim().min(1).max(500),
    employer: z.string().trim().min(1).max(500),
    jobUrl: z.string().trim().url().max(2000).optional(),
    applicationLink: z.string().trim().url().max(2000).optional(),
    location: z.string().trim().max(200).optional(),
    salary: z.string().trim().max(200).optional(),
    deadline: z.string().trim().max(100).optional(),
    jobDescription: z.string().trim().min(1).max(40000),
    jobType: z.string().trim().max(200).optional(),
    jobLevel: z.string().trim().max(200).optional(),
    jobFunction: z.string().trim().max(200).optional(),
    disciplines: z.string().trim().max(200).optional(),
    degreeRequired: z.string().trim().max(200).optional(),
    starting: z.string().trim().max(200).optional(),
  }),
});

const cleanOptional = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

type FetchedManualJobContent = {
  content: string;
  url: string;
  pageTitle: string | null;
  ogTitle: string | null;
  ogSiteName: string | null;
  host: string | null;
};

type ManualJobCreationResult = {
  job: Job;
  movedToReady: boolean;
  warning: string | null;
};

function getRequestId(res: Response): string {
  return String(res.getHeader("x-request-id") || "unknown");
}

function getHost(value: string): string | null {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function formatHostLabel(host: string | null): string | null {
  if (!host) return null;
  const hostname = host.replace(/^www\./i, "");
  const label = hostname.split(".")[0]?.trim();
  if (!label) return hostname;
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function normalizeFetchedValue(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function fetchManualJobContent(
  input: z.infer<typeof manualJobFetchSchema>,
): Promise<FetchedManualJobContent> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(input.url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new AppError({
        status: 502,
        code: "UPSTREAM_ERROR",
        message: `Failed to fetch URL: ${response.status} ${response.statusText}`,
      });
    }

    const html = await response.text();
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const pageTitle = normalizeFetchedValue(
      document.querySelector("title")?.textContent,
    );
    const metaDescription = normalizeFetchedValue(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content"),
    );
    const ogTitle = normalizeFetchedValue(
      document
        .querySelector('meta[property="og:title"]')
        ?.getAttribute("content"),
    );
    const ogDescription = normalizeFetchedValue(
      document
        .querySelector('meta[property="og:description"]')
        ?.getAttribute("content"),
    );
    const ogSiteName = normalizeFetchedValue(
      document
        .querySelector('meta[property="og:site-name"]')
        ?.getAttribute("content"),
    );

    const elementsToRemove = document.querySelectorAll(
      "script, style, nav, header, footer, aside, iframe, noscript, " +
        '[role="navigation"], [role="banner"], [role="contentinfo"], ' +
        ".nav, .navbar, .header, .footer, .sidebar, .menu, .cookie, .popup, .modal, .ad, .advertisement",
    );
    elementsToRemove.forEach((el) => {
      el.remove();
    });

    const mainContent =
      document.querySelector(
        'main, [role="main"], article, ' +
          ".job-description, .job-details, .job-content, .vacancy-description, " +
          "#job-description, #job-details, #job-content, " +
          '[class*="job-desc"], [class*="jobDesc"], [class*="vacancy"], [class*="posting"]',
      ) || document.body;

    let textContent = mainContent?.textContent || "";
    textContent = textContent
      .replace(/[\t ]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    let enrichedContent = "";
    if (pageTitle) enrichedContent += `Page Title: ${pageTitle}\n`;
    if (ogTitle && ogTitle !== pageTitle)
      enrichedContent += `Job Title: ${ogTitle}\n`;
    if (ogSiteName) enrichedContent += `Company/Site: ${ogSiteName}\n`;
    if (ogDescription) enrichedContent += `Summary: ${ogDescription}\n`;
    if (metaDescription && metaDescription !== ogDescription) {
      enrichedContent += `Description: ${metaDescription}\n`;
    }
    if (enrichedContent) enrichedContent += "\n---\n\n";
    enrichedContent += textContent;

    if (enrichedContent.length > 50_000) {
      enrichedContent = enrichedContent.substring(0, 50_000);
    }

    if (!enrichedContent.trim()) {
      throw new AppError({
        status: 502,
        code: "UPSTREAM_ERROR",
        message: "Fetched URL did not contain usable job content",
      });
    }

    return {
      content: enrichedContent,
      url: input.url,
      pageTitle,
      ogTitle,
      ogSiteName,
      host: getHost(input.url),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function applyUrlIngestionFallbacks(
  draft: ManualJobDraft,
  fetched: FetchedManualJobContent,
): ManualJobDraft {
  const hostLabel = formatHostLabel(fetched.host);
  return {
    ...draft,
    title:
      cleanOptional(draft.title) ??
      cleanOptional(fetched.ogTitle) ??
      cleanOptional(fetched.pageTitle) ??
      hostLabel ??
      undefined,
    employer:
      cleanOptional(draft.employer) ??
      cleanOptional(fetched.ogSiteName) ??
      hostLabel ??
      undefined,
    jobUrl: cleanOptional(draft.jobUrl) ?? fetched.url,
  };
}

async function startManualJobScoring(jobId: string): Promise<void> {
  (async () => {
    try {
      const job = await jobsRepo.getJobById(jobId);
      if (!job) return;

      const rawProfile = await getProfile();
      if (
        !rawProfile ||
        typeof rawProfile !== "object" ||
        Array.isArray(rawProfile)
      ) {
        throw new Error("Invalid resume profile format");
      }
      const profile = rawProfile as Record<string, unknown>;
      const { score, reason } = await scoreJobSuitability(job, profile);
      await jobsRepo.updateJob(job.id, {
        suitabilityScore: score,
        suitabilityReason: reason,
      });
    } catch (error) {
      logger.warn("Manual job scoring failed", {
        jobId,
        error,
      });
    }
  })().catch((error) => {
    logger.warn("Manual job scoring task failed to start", {
      jobId,
      error,
    });
  });
}

async function createAndProcessManualJob(
  job: z.infer<typeof manualJobImportSchema>["job"],
  options?: {
    analyticsOrigin?: "manual_job_create" | "move_to_ready";
    allowProcessFailure?: boolean;
    requestId?: string;
    route?: string;
    host?: string | null;
  },
): Promise<ManualJobCreationResult> {
  const jobUrl =
    cleanOptional(job.jobUrl) ||
    cleanOptional(job.applicationLink) ||
    `manual://${randomUUID()}`;

  const createdJob = await jobsRepo.createJob({
    source: "manual",
    title: job.title.trim(),
    employer: job.employer.trim(),
    jobUrl,
    applicationLink: cleanOptional(job.applicationLink) ?? undefined,
    location: cleanOptional(job.location) ?? undefined,
    salary: cleanOptional(job.salary) ?? undefined,
    deadline: cleanOptional(job.deadline) ?? undefined,
    jobDescription: job.jobDescription.trim(),
    jobType: cleanOptional(job.jobType) ?? undefined,
    jobLevel: cleanOptional(job.jobLevel) ?? undefined,
    jobFunction: cleanOptional(job.jobFunction) ?? undefined,
    disciplines: cleanOptional(job.disciplines) ?? undefined,
    degreeRequired: cleanOptional(job.degreeRequired) ?? undefined,
    starting: cleanOptional(job.starting) ?? undefined,
  });

  const processResult = await processJob(createdJob.id, {
    analyticsOrigin: options?.analyticsOrigin ?? "manual_job_create",
  });
  const movedToReady = processResult.success;
  const warning = movedToReady
    ? null
    : processResult.error ||
      "Imported job but failed to move it to ready automatically";

  if (!movedToReady) {
    logger.warn("Manual job auto-processing failed", {
      route: options?.route ?? "manual-jobs",
      requestId: options?.requestId,
      jobId: createdJob.id,
      host: options?.host ?? null,
      error: processResult.error ?? "Unknown error",
    });
    if (!options?.allowProcessFailure) {
      throw new AppError({
        status: 502,
        code: "UPSTREAM_ERROR",
        message:
          warning ??
          "Imported job but failed to move it to ready automatically",
        details: { jobId: createdJob.id },
      });
    }
  }

  const processedJob = await jobsRepo.getJobById(createdJob.id);
  if (!processedJob) {
    throw notFound("Job not found");
  }

  await startManualJobScoring(processedJob.id);

  return {
    job: processedJob,
    movedToReady,
    warning,
  };
}

/**
 * POST /api/manual-jobs/fetch - Fetch and extract job content from a URL
 */
manualJobsRouter.post("/fetch", async (req: Request, res: Response) => {
  try {
    const input = manualJobFetchSchema.parse(req.body ?? {});
    const fetched = await fetchManualJobContent(input);

    ok(res, {
      content: fetched.content,
      url: fetched.url,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    if (error instanceof Error && error.name === "AbortError") {
      return fail(res, requestTimeout());
    }
    fail(res, toAppError(error));
  }
});

/**
 * POST /api/manual-jobs/infer - Infer job details from a pasted description
 */
manualJobsRouter.post("/infer", async (req: Request, res: Response) => {
  try {
    const input = manualJobInferenceSchema.parse(req.body ?? {});
    const result = await inferManualJobDetails(input.jobDescription);

    ok(res, {
      job: result.job,
      warning: result.warning ?? null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    fail(res, toAppError(error));
  }
});

/**
 * POST /api/manual-jobs/import - Import a manually curated job into the DB
 */
manualJobsRouter.post("/import", async (req: Request, res: Response) => {
  try {
    const input = manualJobImportSchema.parse(req.body ?? {});
    const result = await createAndProcessManualJob(input.job, {
      analyticsOrigin: "manual_job_create",
      route: "POST /api/manual-jobs/import",
      requestId: getRequestId(res),
      host: getHost(input.job.jobUrl ?? input.job.applicationLink ?? ""),
    });

    ok(res, result.job);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    fail(res, toAppError(error));
  }
});

/**
 * POST /api/manual-jobs/ingest - Fetch a URL and import it directly
 */
manualJobsRouter.post("/ingest", async (req: Request, res: Response) => {
  const requestId = getRequestId(res);

  try {
    const input = manualJobFetchSchema.parse(req.body ?? {});
    const fetched = await fetchManualJobContent(input);
    const inference = await inferManualJobDetails(fetched.content);
    const draft = applyUrlIngestionFallbacks(inference.job, fetched);

    const title = cleanOptional(draft.title);
    const employer = cleanOptional(draft.employer);
    const jobDescription = cleanOptional(draft.jobDescription);

    if (!jobDescription) {
      return fail(
        res,
        unprocessableEntity(
          "Fetched content did not contain enough job details to import",
        ),
      );
    }

    if (!title || !employer) {
      return fail(
        res,
        unprocessableEntity(
          "Fetched content did not contain enough metadata to create a job",
          {
            missing: {
              title: !title,
              employer: !employer,
            },
          },
        ),
      );
    }

    const result = await createAndProcessManualJob(
      {
        ...draft,
        title,
        employer,
        jobDescription,
      },
      {
        analyticsOrigin: "manual_job_create",
        allowProcessFailure: true,
        route: "POST /api/manual-jobs/ingest",
        requestId,
        host: fetched.host,
      },
    );

    logger.info("Manual job URL ingestion completed", {
      route: "POST /api/manual-jobs/ingest",
      requestId,
      jobId: result.job?.id ?? null,
      host: fetched.host,
      movedToReady: result.movedToReady,
    });

    const payload: ManualJobIngestionResponse = {
      job: result.job,
      ingestion: {
        source: "url",
        movedToReady: result.movedToReady,
        warning: result.warning,
      },
    };

    ok(res, payload);
  } catch (error) {
    const err = toAppError(error);
    logger.warn("Manual job URL ingestion failed", {
      route: "POST /api/manual-jobs/ingest",
      requestId,
      host: getHost(String(req.body?.url ?? "")),
      status: err.status,
      code: err.code,
      details: err.details,
    });
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    fail(res, err);
  }
});
