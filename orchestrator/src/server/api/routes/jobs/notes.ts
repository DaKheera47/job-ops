import { badRequest, notFound, toAppError } from "@infra/errors";
import { fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import { type Request, type Response, Router } from "express";
import { jobNoteSchema } from "./shared";

export const jobsNotesRouter = Router();

jobsNotesRouter.get("/:id/notes", async (req: Request, res: Response) => {
  const requestId = String(res.getHeader("x-request-id") || "unknown");

  try {
    const job = await jobsRepo.getJobById(req.params.id);
    if (!job) {
      const err = notFound("Job not found");
      logger.warn("Job notes fetch failed", {
        route: "GET /api/jobs/:id/notes",
        jobId: req.params.id,
        requestId,
        status: err.status,
        code: err.code,
      });
      return fail(res, err);
    }

    const notes = await jobsRepo.listJobNotes(job.id);

    logger.info("Job notes fetched", {
      route: "GET /api/jobs/:id/notes",
      jobId: job.id,
      requestId,
      returnedCount: notes.length,
    });

    ok(res, notes);
  } catch (error) {
    const err = toAppError(error);
    logger.error("Job notes fetch failed", {
      route: "GET /api/jobs/:id/notes",
      jobId: req.params.id,
      requestId,
      status: err.status,
      code: err.code,
      details: err.details,
      errorMessage: error instanceof Error ? error.message : undefined,
    });
    fail(res, err);
  }
});

jobsNotesRouter.post("/:id/notes", async (req: Request, res: Response) => {
  const requestId = String(res.getHeader("x-request-id") || "unknown");

  try {
    const input = jobNoteSchema.safeParse(req.body);
    if (!input.success) {
      return fail(
        res,
        badRequest("Invalid job note request", input.error.flatten()),
      );
    }

    const job = await jobsRepo.getJobById(req.params.id);
    if (!job) {
      const err = notFound("Job not found");
      logger.warn("Job note create failed", {
        route: "POST /api/jobs/:id/notes",
        jobId: req.params.id,
        requestId,
        status: err.status,
        code: err.code,
      });
      return fail(res, err);
    }

    const note = await jobsRepo.createJobNote({
      jobId: job.id,
      ...input.data,
    });

    logger.info("Job note created", {
      route: "POST /api/jobs/:id/notes",
      jobId: job.id,
      noteId: note.id,
      requestId,
    });

    ok(res, note, 201);
  } catch (error) {
    const err = toAppError(error);
    logger.error("Job note create failed", {
      route: "POST /api/jobs/:id/notes",
      jobId: req.params.id,
      requestId,
      status: err.status,
      code: err.code,
      details: err.details,
      errorMessage: error instanceof Error ? error.message : undefined,
    });
    fail(res, err);
  }
});

jobsNotesRouter.patch(
  "/:id/notes/:noteId",
  async (req: Request, res: Response) => {
    const requestId = String(res.getHeader("x-request-id") || "unknown");

    try {
      const input = jobNoteSchema.safeParse(req.body);
      if (!input.success) {
        return fail(
          res,
          badRequest("Invalid job note request", input.error.flatten()),
        );
      }

      const job = await jobsRepo.getJobById(req.params.id);
      if (!job) {
        const err = notFound("Job not found");
        logger.warn("Job note update failed", {
          route: "PATCH /api/jobs/:id/notes/:noteId",
          jobId: req.params.id,
          noteId: req.params.noteId,
          requestId,
          status: err.status,
          code: err.code,
        });
        return fail(res, err);
      }

      const note = await jobsRepo.updateJobNote({
        jobId: job.id,
        noteId: req.params.noteId,
        ...input.data,
      });
      if (!note) {
        const err = notFound("Job note not found");
        logger.warn("Job note update failed", {
          route: "PATCH /api/jobs/:id/notes/:noteId",
          jobId: job.id,
          noteId: req.params.noteId,
          requestId,
          status: err.status,
          code: err.code,
        });
        return fail(res, err);
      }

      logger.info("Job note updated", {
        route: "PATCH /api/jobs/:id/notes/:noteId",
        jobId: job.id,
        noteId: note.id,
        requestId,
      });

      ok(res, note);
    } catch (error) {
      const err = toAppError(error);
      logger.error("Job note update failed", {
        route: "PATCH /api/jobs/:id/notes/:noteId",
        jobId: req.params.id,
        noteId: req.params.noteId,
        requestId,
        status: err.status,
        code: err.code,
        details: err.details,
        errorMessage: error instanceof Error ? error.message : undefined,
      });
      fail(res, err);
    }
  },
);

jobsNotesRouter.delete(
  "/:id/notes/:noteId",
  async (req: Request, res: Response) => {
    const requestId = String(res.getHeader("x-request-id") || "unknown");

    try {
      const job = await jobsRepo.getJobById(req.params.id);
      if (!job) {
        const err = notFound("Job not found");
        logger.warn("Job note delete failed", {
          route: "DELETE /api/jobs/:id/notes/:noteId",
          jobId: req.params.id,
          noteId: req.params.noteId,
          requestId,
          status: err.status,
          code: err.code,
        });
        return fail(res, err);
      }

      const deletedCount = await jobsRepo.deleteJobNote({
        jobId: job.id,
        noteId: req.params.noteId,
      });
      if (deletedCount === 0) {
        const err = notFound("Job note not found");
        logger.warn("Job note delete failed", {
          route: "DELETE /api/jobs/:id/notes/:noteId",
          jobId: job.id,
          noteId: req.params.noteId,
          requestId,
          status: err.status,
          code: err.code,
        });
        return fail(res, err);
      }

      logger.info("Job note deleted", {
        route: "DELETE /api/jobs/:id/notes/:noteId",
        jobId: job.id,
        noteId: req.params.noteId,
        requestId,
      });

      ok(res, null);
    } catch (error) {
      const err = toAppError(error);
      logger.error("Job note delete failed", {
        route: "DELETE /api/jobs/:id/notes/:noteId",
        jobId: req.params.id,
        noteId: req.params.noteId,
        requestId,
        status: err.status,
        code: err.code,
        details: err.details,
        errorMessage: error instanceof Error ? error.message : undefined,
      });
      fail(res, err);
    }
  },
);
