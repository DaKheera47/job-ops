import { badRequest, notFound } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import { type Request, type Response, Router } from "express";
import { jobNoteSchema, toJobsRouteError } from "./shared";

export const jobsNotesRouter = Router();

function getRequestId(res: Response): string {
  return String(res.getHeader("x-request-id") || "unknown");
}

async function loadJobOrRespondNotFound(
  req: Request,
  res: Response,
  route: string,
  requestId: string,
  noteId?: string,
) {
  const job = await jobsRepo.getJobById(req.params.id);
  if (job) {
    return job;
  }

  const err = notFound("Job not found");
  logger.warn("Job note route failed", {
    route,
    jobId: req.params.id,
    noteId,
    requestId,
    status: err.status,
    code: err.code,
  });
  fail(res, err);
  return null;
}

function failJobNotesRoute(
  req: Request,
  res: Response,
  route: string,
  requestId: string,
  error: unknown,
  noteId?: string,
): void {
  const err = toJobsRouteError(error);
  logger.error("Job note route failed", {
    route,
    jobId: req.params.id,
    noteId,
    requestId,
    status: err.status,
    code: err.code,
    details: err.details,
    errorMessage: error instanceof Error ? error.message : undefined,
  });
  fail(res, err);
}

jobsNotesRouter.get("/:id/notes", async (req: Request, res: Response) => {
  const requestId = getRequestId(res);
  const route = "GET /api/jobs/:id/notes";

  try {
    const job = await loadJobOrRespondNotFound(req, res, route, requestId);
    if (!job) return;

    const notes = await jobsRepo.listJobNotes(job.id);

    logger.info("Job notes fetched", {
      route,
      jobId: job.id,
      requestId,
      returnedCount: notes.length,
    });

    ok(res, notes);
  } catch (error) {
    failJobNotesRoute(req, res, route, requestId, error);
  }
});

jobsNotesRouter.post("/:id/notes", async (req: Request, res: Response) => {
  const requestId = getRequestId(res);
  const route = "POST /api/jobs/:id/notes";

  try {
    const input = jobNoteSchema.safeParse(req.body);
    if (!input.success) {
      return fail(
        res,
        badRequest("Invalid job note request", input.error.flatten()),
      );
    }

    const job = await loadJobOrRespondNotFound(req, res, route, requestId);
    if (!job) return;

    const note = await jobsRepo.createJobNote({
      jobId: job.id,
      ...input.data,
    });

    logger.info("Job note created", {
      route,
      jobId: job.id,
      noteId: note.id,
      requestId,
    });

    ok(res, note, 201);
  } catch (error) {
    failJobNotesRoute(req, res, route, requestId, error);
  }
});

jobsNotesRouter.patch(
  "/:id/notes/:noteId",
  async (req: Request, res: Response) => {
    const requestId = getRequestId(res);
    const route = "PATCH /api/jobs/:id/notes/:noteId";

    try {
      const input = jobNoteSchema.safeParse(req.body);
      if (!input.success) {
        return fail(
          res,
          badRequest("Invalid job note request", input.error.flatten()),
        );
      }

      const job = await loadJobOrRespondNotFound(
        req,
        res,
        route,
        requestId,
        req.params.noteId,
      );
      if (!job) return;

      const note = await jobsRepo.updateJobNote({
        jobId: job.id,
        noteId: req.params.noteId,
        ...input.data,
      });
      if (!note) {
        const err = notFound("Job note not found");
        logger.warn("Job note route failed", {
          route,
          jobId: job.id,
          noteId: req.params.noteId,
          requestId,
          status: err.status,
          code: err.code,
        });
        return fail(res, err);
      }

      logger.info("Job note updated", {
        route,
        jobId: job.id,
        noteId: note.id,
        requestId,
      });

      ok(res, note);
    } catch (error) {
      failJobNotesRoute(req, res, route, requestId, error, req.params.noteId);
    }
  },
);

jobsNotesRouter.delete(
  "/:id/notes/:noteId",
  async (req: Request, res: Response) => {
    const requestId = getRequestId(res);
    const route = "DELETE /api/jobs/:id/notes/:noteId";

    try {
      const job = await loadJobOrRespondNotFound(
        req,
        res,
        route,
        requestId,
        req.params.noteId,
      );
      if (!job) return;

      const deletedCount = await jobsRepo.deleteJobNote({
        jobId: job.id,
        noteId: req.params.noteId,
      });
      if (deletedCount === 0) {
        const err = notFound("Job note not found");
        logger.warn("Job note route failed", {
          route,
          jobId: job.id,
          noteId: req.params.noteId,
          requestId,
          status: err.status,
          code: err.code,
        });
        return fail(res, err);
      }

      logger.info("Job note deleted", {
        route,
        jobId: job.id,
        noteId: req.params.noteId,
        requestId,
      });

      ok(res, null);
    } catch (error) {
      failJobNotesRoute(req, res, route, requestId, error, req.params.noteId);
    }
  },
);
