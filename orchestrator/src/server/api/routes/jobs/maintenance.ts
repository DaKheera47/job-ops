import { badRequest, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { isDemoMode, sendDemoBlocked } from "@server/config/demo";
import * as jobsRepo from "@server/repositories/jobs";
import type { JobStatus } from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const jobsMaintenanceRouter = Router();

const jobStatusParamSchema = z.enum([
  "discovered",
  "processing",
  "ready",
  "applied",
  "in_progress",
  "skipped",
  "expired",
]);

jobsMaintenanceRouter.delete(
  "/status/:status",
  async (req: Request, res: Response) => {
    try {
      if (isDemoMode()) {
        return sendDemoBlocked(
          res,
          "Clearing jobs by status is disabled to keep the demo stable.",
          {
            route: "DELETE /api/jobs/status/:status",
            status: req.params.status,
          },
        );
      }

      const parseResult = jobStatusParamSchema.safeParse(req.params.status);
      if (!parseResult.success) {
        return fail(res, badRequest("Invalid job status"));
      }

      const status: JobStatus = parseResult.data;
      const count = await jobsRepo.deleteJobsByStatus(status);

      ok(res, {
        message: `Cleared ${count} ${status} jobs`,
        count,
      });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

jobsMaintenanceRouter.delete(
  "/score/:threshold",
  async (req: Request, res: Response) => {
    try {
      if (isDemoMode()) {
        return sendDemoBlocked(
          res,
          "Clearing jobs by score is disabled to keep the demo stable.",
          {
            route: "DELETE /api/jobs/score/:threshold",
            threshold: req.params.threshold,
          },
        );
      }

      const threshold = parseInt(req.params.threshold, 10);
      if (Number.isNaN(threshold) || threshold < 0 || threshold > 100) {
        return fail(
          res,
          badRequest("Threshold must be a number between 0 and 100"),
        );
      }

      const count = await jobsRepo.deleteJobsBelowScore(threshold);

      ok(res, {
        message: `Cleared ${count} jobs with score below ${threshold}`,
        count,
        threshold,
      });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);
