import { rm } from "node:fs/promises";
import { AppError, badRequest, notFound, toAppError } from "@infra/errors";
import { fail, ok, okWithMeta } from "@infra/http";
import { logger } from "@infra/logger";
import { isDemoMode } from "@server/config/demo";
import { resolveRequestOrigin } from "@server/infra/request-origin";
import { generateFinalPdf, summarizeJob } from "@server/pipeline/index";
import * as jobsRepo from "@server/repositories/jobs";
import {
  simulateGeneratePdf,
  simulateSummarizeJob,
} from "@server/services/demo-simulator";
import { uploadJobPdf } from "@server/services/job-pdf-upload";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import {
  appErrorFromPipelineFailure,
  hydrateJobPdfFreshness,
  queueTailoringAutoPdfRegenerationIfNeeded,
  uploadJobPdfSchema,
} from "./shared";

export const jobsDocumentsRouter = Router();

jobsDocumentsRouter.post("/:id/pdf", async (req: Request, res: Response) => {
  let uploadedPath: string | null = null;

  try {
    const input = uploadJobPdfSchema.parse(req.body);
    const currentJob = await jobsRepo.getJobById(req.params.id);

    if (!currentJob) {
      const err = new AppError({
        status: 404,
        code: "NOT_FOUND",
        message: "Job not found",
      });
      logger.warn("Job PDF upload failed", {
        route: "POST /api/jobs/:id/pdf",
        jobId: req.params.id,
        status: err.status,
        code: err.code,
      });
      fail(res, err);
      return;
    }

    const uploaded = await uploadJobPdf({
      jobId: req.params.id,
      fileName: input.fileName,
      mediaType: input.mediaType,
      dataBase64: input.dataBase64,
    });
    uploadedPath = uploaded.outputPath;

    const job = await jobsRepo.updateJob(req.params.id, {
      pdfPath: uploaded.outputPath,
      pdfSource: "uploaded",
      pdfRegenerating: false,
      pdfFingerprint: null,
      pdfGeneratedAt: new Date().toISOString(),
    });

    if (!job) {
      await rm(uploaded.outputPath, { force: true }).catch((cleanupError) => {
        logger.warn("Failed to clean up uploaded PDF after missing job", {
          route: "POST /api/jobs/:id/pdf",
          jobId: req.params.id,
          cleanupError,
        });
      });

      const err = new AppError({
        status: 404,
        code: "NOT_FOUND",
        message: "Job not found",
      });
      logger.warn("Job PDF upload failed", {
        route: "POST /api/jobs/:id/pdf",
        jobId: req.params.id,
        status: err.status,
        code: err.code,
      });
      fail(res, err);
      return;
    }

    logger.info("Job PDF uploaded", {
      route: "POST /api/jobs/:id/pdf",
      jobId: req.params.id,
      fileName: input.fileName,
      byteLength: uploaded.byteLength,
    });

    ok(res, await hydrateJobPdfFreshness(job), 201);
  } catch (error) {
    const err =
      error instanceof z.ZodError
        ? badRequest(
            error.issues[0]?.message ?? "Invalid job PDF upload request",
            error.flatten(),
          )
        : error instanceof AppError
          ? error
          : new AppError({
              status: 500,
              code: "INTERNAL_ERROR",
              message: error instanceof Error ? error.message : "Unknown error",
            });

    if (uploadedPath) {
      await rm(uploadedPath, { force: true }).catch((cleanupError) => {
        logger.warn("Failed to clean up uploaded PDF after route error", {
          route: "POST /api/jobs/:id/pdf",
          jobId: req.params.id,
          cleanupError,
        });
      });
    }

    logger.error("Job PDF upload failed", {
      route: "POST /api/jobs/:id/pdf",
      jobId: req.params.id,
      status: err.status,
      code: err.code,
      details: err.details,
      uploadedPath,
    });

    fail(res, err);
  }
});

jobsDocumentsRouter.post(
  "/:id/summarize",
  async (req: Request, res: Response) => {
    try {
      const forceRaw = req.query.force as string | undefined;
      const force = forceRaw === "1" || forceRaw === "true";

      if (isDemoMode()) {
        const result = await simulateSummarizeJob(req.params.id, { force });
        if (!result.success) {
          return fail(
            res,
            badRequest(result.error ?? "Failed to summarize the job"),
          );
        }
        const job = await jobsRepo.getJobById(req.params.id);
        if (!job) {
          return fail(res, notFound("Job not found"));
        }
        return okWithMeta(res, await hydrateJobPdfFreshness(job), {
          simulated: true,
        });
      }

      const previousJob = await jobsRepo.getJobById(req.params.id);
      const result = await summarizeJob(req.params.id, { force });

      if (!result.success) {
        return fail(
          res,
          badRequest(result.error ?? "Failed to summarize the job"),
        );
      }

      const job = await jobsRepo.getJobById(req.params.id);
      if (!job) {
        return fail(res, notFound("Job not found"));
      }
      ok(res, await hydrateJobPdfFreshness(job));

      if (previousJob) {
        queueTailoringAutoPdfRegenerationIfNeeded(
          previousJob,
          job,
          "POST /api/jobs/:id/summarize",
        );
      }
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

jobsDocumentsRouter.post(
  "/:id/generate-pdf",
  async (req: Request, res: Response) => {
    try {
      if (isDemoMode()) {
        const result = await simulateGeneratePdf(req.params.id);
        if (!result.success) {
          return fail(
            res,
            badRequest(result.error ?? "Failed to generate a resume PDF"),
          );
        }
        const job = await jobsRepo.getJobById(req.params.id);
        if (!job) {
          return fail(res, notFound("Job not found"));
        }
        return okWithMeta(res, await hydrateJobPdfFreshness(job), {
          simulated: true,
        });
      }

      const result = await generateFinalPdf(req.params.id, {
        requestOrigin: resolveRequestOrigin(req),
        analyticsOrigin: "generate_pdf",
      });

      if (!result.success) {
        return fail(
          res,
          appErrorFromPipelineFailure(
            result,
            "Failed to generate a resume PDF",
          ),
        );
      }

      const job = await jobsRepo.getJobById(req.params.id);
      if (!job) {
        return fail(res, notFound("Job not found"));
      }
      ok(res, await hydrateJobPdfFreshness(job));
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);
