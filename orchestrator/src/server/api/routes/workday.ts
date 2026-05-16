import {
  getJobDetailsFromCxs,
  getJobsFromCxs,
  WorkdayCxsFetchError,
  workdayUrlToCxsJobsUrl,
} from "@career-boards/workday";
import {
  badRequest,
  requestTimeout,
  toAppError,
  upstreamError,
} from "@infra/errors";
import { fail, ok } from "@infra/http";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const workdayRouter = Router();

const fetchWorkdayJobsSchema = z.object({
  careersUrl: z.string().trim().url().max(2000),
  maxJobs: z.number().int().min(1).max(500).optional(),
});

workdayRouter.post("/fetch-jobs", async (req: Request, res: Response) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const input = fetchWorkdayJobsSchema.parse(req.body ?? {});

    let cxsJobsUrl: string;
    try {
      cxsJobsUrl = workdayUrlToCxsJobsUrl(input.careersUrl);
    } catch (error) {
      return fail(
        res,
        badRequest(
          `Invalid Workday URL: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    const response = await getJobsFromCxs({
      cxsJobsUrl,
      careersUrl: input.careersUrl,
      maxJobs: input.maxJobs ?? 40,
      signal: controller.signal,
    });

    const jobs = await Promise.all(
      response.jobs.map(async (job) => {
        const details = await getJobDetailsFromCxs({
          jobUrl: job.jobUrl,
          signal: controller.signal,
        });

        return {
          ...job,
          company: job.company ?? details.job.company,
          locationText: job.locationText ?? details.job.locationText,
          postedOn: job.postedOn ?? details.job.postedOn,
          jobDescriptionHtml: details.job.jobDescriptionHtml,
          jobDescriptionText: details.job.jobDescriptionText,
        };
      }),
    );

    ok(res, {
      careersUrl: input.careersUrl,
      cxsJobsUrl,
      response: {
        ...response,
        jobs,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    if (error instanceof Error && error.name === "AbortError") {
      return fail(res, requestTimeout());
    }
    if (error instanceof WorkdayCxsFetchError) {
      return fail(
        res,
        upstreamError(error.message, {
          url: error.url,
          status: error.status,
        }),
      );
    }
    fail(res, toAppError(error));
  } finally {
    clearTimeout(timeout);
  }
});
