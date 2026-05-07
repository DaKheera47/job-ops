import { badRequest, notFound, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { resolveRequestOrigin } from "@server/infra/request-origin";
import * as jobsRepo from "@server/repositories/jobs";
import { reconcileActivationMilestonesFromHistorySafely } from "@server/services/activation-funnel";
import {
  deleteStageEvent,
  getStageEvents,
  getTasks,
  transitionStage,
  updateStageEvent,
} from "@server/services/applicationTracking";
import { trackApplicationAcceptedIfNeeded } from "@server/services/jobs/analytics";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import {
  hydrateJobPdfFreshness,
  transitionStageSchema,
  updateOutcomeSchema,
  updateStageEventSchema,
} from "./shared";

export const jobsStagesRouter = Router();

jobsStagesRouter.get("/:id/events", async (req: Request, res: Response) => {
  try {
    const events = await getStageEvents(req.params.id);
    ok(res, events);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

jobsStagesRouter.get("/:id/tasks", async (req: Request, res: Response) => {
  try {
    const includeCompleted =
      req.query.includeCompleted === "1" ||
      req.query.includeCompleted === "true";
    const tasks = await getTasks(req.params.id, includeCompleted);
    ok(res, tasks);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

jobsStagesRouter.post("/:id/stages", async (req: Request, res: Response) => {
  try {
    const input = transitionStageSchema.parse(req.body);
    const event = transitionStage(
      req.params.id,
      input.toStage,
      input.occurredAt ?? undefined,
      input.metadata ?? null,
      input.outcome ?? null,
    );
    ok(res, event);
    queueMicrotask(() => {
      void reconcileActivationMilestonesFromHistorySafely({
        route: "POST /api/jobs/:id/stages",
        jobId: req.params.id,
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    fail(res, toAppError(error));
  }
});

jobsStagesRouter.patch(
  "/:id/events/:eventId",
  async (req: Request, res: Response) => {
    try {
      const input = updateStageEventSchema.parse(req.body);
      updateStageEvent(req.params.eventId, input);
      ok(res, null);
      queueMicrotask(() => {
        void reconcileActivationMilestonesFromHistorySafely({
          route: "PATCH /api/jobs/:id/events/:eventId",
          jobId: req.params.id,
          eventId: req.params.eventId,
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return fail(res, badRequest(error.message, error.flatten()));
      }
      fail(res, toAppError(error));
    }
  },
);

jobsStagesRouter.delete(
  "/:id/events/:eventId",
  async (req: Request, res: Response) => {
    try {
      deleteStageEvent(req.params.eventId);
      ok(res, null);
      queueMicrotask(() => {
        void reconcileActivationMilestonesFromHistorySafely({
          route: "DELETE /api/jobs/:id/events/:eventId",
          jobId: req.params.id,
          eventId: req.params.eventId,
        });
      });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

jobsStagesRouter.patch("/:id/outcome", async (req: Request, res: Response) => {
  try {
    const input = updateOutcomeSchema.parse(req.body);
    const currentJob = await jobsRepo.getJobById(req.params.id);
    if (!currentJob) {
      return fail(res, notFound("Job not found"));
    }
    const closedAt = input.outcome
      ? (input.closedAt ?? Math.floor(Date.now() / 1000))
      : null;
    const job = await jobsRepo.updateJob(req.params.id, {
      outcome: input.outcome,
      closedAt,
    });

    if (!job) {
      return fail(res, notFound("Job not found"));
    }

    trackApplicationAcceptedIfNeeded({
      closedAt: job.closedAt,
      nextOutcome: job.outcome,
      previousOutcome: currentJob.outcome,
      requestOrigin: resolveRequestOrigin(req),
      source: "jobs_outcome_route",
    });

    ok(res, await hydrateJobPdfFreshness(job));
    queueMicrotask(() => {
      void reconcileActivationMilestonesFromHistorySafely({
        route: "PATCH /api/jobs/:id/outcome",
        jobId: req.params.id,
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    fail(res, toAppError(error));
  }
});
