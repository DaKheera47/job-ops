import { badRequest, notFound } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import { attachAppliedDuplicateMatches } from "@server/services/applied-duplicate-matching";
import { getPdfPath, pdfExists } from "@server/services/pdf";
import {
  applyJobsPdfFreshness,
  resolvePdfFingerprintContext,
} from "@server/services/pdf-fingerprint";
import {
  DEFAULT_JOB_EMAIL_LIMIT,
  listJobPostApplicationEmails,
  MAX_JOB_EMAIL_LIMIT,
} from "@server/services/post-application/job-emails";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import {
  hydrateJobPdfFreshness,
  JOBS_BENCHMARK_ENABLED,
  jobsRevisionQuerySchema,
  listJobsQuerySchema,
  parseStatusFilter,
  requireJob,
  toJobListItem,
  toJobsRouteError,
} from "./shared";

export const jobsReadRouter = Router();

const jobEmailsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_JOB_EMAIL_LIMIT)
    .default(DEFAULT_JOB_EMAIL_LIMIT),
});

jobsReadRouter.get("/", async (req: Request, res: Response) => {
  try {
    const benchmarkStart = performance.now();
    let queryParseMs = 0;
    let primaryQueryMs = 0;
    const duplicateCandidatesQueryMs = 0;
    const duplicateMatchCpuMs = 0;
    let statsAggregateMs = 0;
    let revisionAggregateMs = 0;

    const queryParseStart = performance.now();
    const parsedQuery = listJobsQuerySchema.safeParse(req.query);
    queryParseMs = performance.now() - queryParseStart;
    if (!parsedQuery.success) {
      return fail(
        res,
        badRequest(
          "Invalid jobs list query parameters",
          parsedQuery.error.flatten(),
        ),
      );
    }

    const statusFilter = parsedQuery.data.status;
    const statuses = parseStatusFilter(statusFilter);
    const view = parsedQuery.data.view ?? "list";

    const primaryQueryStart = performance.now();
    const pdfFingerprintContext = await resolvePdfFingerprintContext();
    const jobs =
      view === "list"
        ? applyJobsPdfFreshness(
            await jobsRepo.getJobListItems(statuses),
            pdfFingerprintContext,
          ).map(toJobListItem)
        : applyJobsPdfFreshness(
            await jobsRepo.getAllJobs(statuses),
            pdfFingerprintContext,
          );
    primaryQueryMs = performance.now() - primaryQueryStart;
    const candidateCount = 0;
    const duplicateMatchingEnabled = false;
    const statsAggregateStart = performance.now();
    const stats = await jobsRepo.getJobStats();
    statsAggregateMs = performance.now() - statsAggregateStart;
    const revisionAggregateStart = performance.now();
    const revision = await jobsRepo.getJobsRevision(statuses);
    revisionAggregateMs = performance.now() - revisionAggregateStart;

    const response = {
      jobs,
      total: jobs.length,
      byStatus: stats,
      revision: revision.revision,
    };
    const internalRouteMs =
      queryParseMs +
      primaryQueryMs +
      duplicateCandidatesQueryMs +
      duplicateMatchCpuMs +
      statsAggregateMs +
      revisionAggregateMs;
    const totalMs = performance.now() - benchmarkStart;

    if (JOBS_BENCHMARK_ENABLED) {
      logger.info("Jobs list benchmark", {
        route: "GET /api/jobs",
        view,
        statusFilter: statusFilter ?? null,
        returnedCount: jobs.length,
        duplicateMatchingEnabled,
        candidateCount,
        totalMs,
        queryParseMs,
        primaryQueryMs,
        duplicateCandidatesQueryMs,
        duplicateMatchCpuMs,
        statsAggregateMs,
        revisionAggregateMs,
        internalRouteMs,
      });
    }

    logger.info("Jobs list fetched", {
      route: "GET /api/jobs",
      view,
      statusFilter: statusFilter ?? null,
      revision: revision.revision,
      returnedCount: jobs.length,
    });

    ok(res, response);
  } catch (error) {
    fail(res, toJobsRouteError(error));
  }
});

jobsReadRouter.get("/revision", async (req: Request, res: Response) => {
  try {
    const parsedQuery = jobsRevisionQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return fail(
        res,
        badRequest(
          "Invalid jobs revision query parameters",
          parsedQuery.error.flatten(),
        ),
      );
    }

    const statuses = parseStatusFilter(parsedQuery.data.status);
    const revision = await jobsRepo.getJobsRevision(statuses);

    const response = {
      revision: revision.revision,
      latestUpdatedAt: revision.latestUpdatedAt,
      total: revision.total,
      statusFilter: revision.statusFilter,
    };

    logger.info("Jobs revision fetched", {
      route: "GET /api/jobs/revision",
      statusFilter: revision.statusFilter,
      revision: revision.revision,
      total: revision.total,
    });

    ok(res, response);
  } catch (error) {
    fail(res, toJobsRouteError(error));
  }
});

jobsReadRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const job = await requireJob(req.params.id);
    const [jobWithAppliedDuplicateMatch] = attachAppliedDuplicateMatches(
      [job],
      await jobsRepo.getAppliedDuplicateMatchCandidates(),
    );
    ok(res, await hydrateJobPdfFreshness(jobWithAppliedDuplicateMatch));
  } catch (error) {
    fail(res, toJobsRouteError(error));
  }
});

jobsReadRouter.get("/:id/emails", async (req: Request, res: Response) => {
  const requestId = String(res.getHeader("x-request-id") || "unknown");
  const route = "GET /api/jobs/:id/emails";
  const jobId = req.params.id;
  const parseResult = jobEmailsQuerySchema.safeParse(req.query);

  if (!parseResult.success) {
    const err = badRequest("Invalid email query", parseResult.error.flatten());
    logger.warn("Job emails fetch failed", {
      route,
      jobId,
      requestId,
      status: err.status,
      code: err.code,
    });
    return fail(res, err);
  }

  try {
    const data = await listJobPostApplicationEmails(
      jobId,
      parseResult.data.limit,
    );

    logger.info("Job emails fetched", {
      route,
      jobId,
      requestId,
      returnedCount: data.items.length,
    });

    ok(res, data);
  } catch (error) {
    const err = toJobsRouteError(error);
    logger[err.status === 404 ? "warn" : "error"]("Job emails fetch failed", {
      route,
      jobId,
      requestId,
      status: err.status,
      code: err.code,
      details: err.details,
      errorMessage: error instanceof Error ? error.message : undefined,
    });
    fail(res, err);
  }
});

jobsReadRouter.get("/:id/pdf", async (req: Request, res: Response) => {
  const currentJob = await jobsRepo.getJobById(req.params.id);
  if (!currentJob || !(await pdfExists(req.params.id))) {
    fail(res, notFound("PDF not found"));
    return;
  }

  const pdfPath = getPdfPath(req.params.id);
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(pdfPath, (error) => {
    if (error) {
      fail(res, notFound("PDF not found"));
    }
  });
});
