import type {
  ApiResponse,
  UkVisaJobsImportResponse,
  UkVisaJobsSearchResponse,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

import { getPipelineStatus } from "../../pipeline/index";
import * as jobsRepo from "../../repositories/jobs";
import { fetchUkVisaJobsPage } from "../../services/ukvisajobs";

export const ukVisaJobsRouter = Router();
let isUkVisaJobsSearchRunning = false;

const ukVisaJobsSearchSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  searchTerm: z.string().trim().min(1).max(200).optional(),
  searchTerms: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  page: z.number().int().min(1).optional(),
});

/**
 * POST /api/ukvisajobs/search - Run a UKVisaJobs search without importing into the DB
 */
ukVisaJobsRouter.post("/search", async (req: Request, res: Response) => {
  let lockAcquired = false;

  try {
    const input = ukVisaJobsSearchSchema.parse(req.body ?? {});

    if (isUkVisaJobsSearchRunning) {
      return res.status(409).json({
        success: false,
        error: "UK Visa Jobs search is already running",
      });
    }

    const { isRunning } = getPipelineStatus();
    if (isRunning) {
      return res.status(409).json({
        success: false,
        error:
          "Pipeline is running. Stop it before running UK Visa Jobs search.",
      });
    }

    isUkVisaJobsSearchRunning = true;
    lockAcquired = true;

    const rawTerms = input.searchTerms ?? [];
    if (rawTerms.length > 1) {
      return res.status(400).json({
        success: false,
        error: "Pagination supports a single search term.",
      });
    }

    const searchTerm = input.searchTerm ?? input.query ?? rawTerms[0];
    const page = input.page ?? 1;

    const result = await fetchUkVisaJobsPage({
      searchKeyword: searchTerm,
      page,
    });

    const totalPages = Math.max(
      1,
      Math.ceil(result.totalJobs / result.pageSize),
    );

    const response: ApiResponse<UkVisaJobsSearchResponse> = {
      ok: true,
      data: {
        jobs: result.jobs,
        totalJobs: result.totalJobs,
        page: result.page,
        pageSize: result.pageSize,
        totalPages,
      },
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  } finally {
    if (lockAcquired) {
      isUkVisaJobsSearchRunning = false;
    }
  }
});

const ukVisaJobsImportSchema = z.object({
  jobs: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(500),
        employer: z.string().trim().min(1).max(500),
        jobUrl: z.string().trim().min(1).max(2000),
        sourceJobId: z.string().trim().min(1).max(200).optional(),
        employerUrl: z.string().trim().min(1).max(2000).optional(),
        applicationLink: z.string().trim().min(1).max(2000).optional(),
        location: z.string().trim().max(200).optional(),
        deadline: z.string().trim().max(100).optional(),
        salary: z.string().trim().max(200).optional(),
        jobDescription: z.string().trim().max(20000).optional(),
        datePosted: z.string().trim().max(100).optional(),
        degreeRequired: z.string().trim().max(200).optional(),
        jobType: z.string().trim().max(200).optional(),
        jobLevel: z.string().trim().max(200).optional(),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * POST /api/ukvisajobs/import - Import selected UKVisaJobs results into the DB
 */
ukVisaJobsRouter.post("/import", async (req: Request, res: Response) => {
  try {
    const input = ukVisaJobsImportSchema.parse(req.body ?? {});

    const jobs = input.jobs.map((job) => ({
      ...job,
      source: "ukvisajobs" as const,
    }));

    const result = await jobsRepo.bulkCreateJobs(jobs);

    const response: ApiResponse<UkVisaJobsImportResponse> = {
      ok: true,
      data: {
        created: result.created,
        skipped: result.skipped,
      },
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});
