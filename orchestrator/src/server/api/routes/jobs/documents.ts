import { rm } from "node:fs/promises";
import { AppError, badRequest } from "@infra/errors";
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
import {
  appErrorFromPipelineFailure,
  hydrateJobPdfFreshness,
  queueTailoringAutoPdfRegenerationIfNeeded,
  requireJob,
  toJobsRouteError,
  uploadJobPdfSchema,
} from "./shared";

export const jobsDocumentsRouter = Router();

const tailoringGenerateFields = ["summary", "headline", "skills"] as const;
type TailoringGenerateField = (typeof tailoringGenerateFields)[number];

const parseTailoringGenerateFields = (
  raw: string | undefined,
): TailoringGenerateField[] | undefined => {
  if (!raw) return undefined;
  const fields = raw
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);
  const invalidFields = fields.filter(
    (field): field is string =>
      !tailoringGenerateFields.includes(field as TailoringGenerateField),
  );
  if (invalidFields.length > 0) {
    throw badRequest("Invalid tailoring generation field", {
      fields,
      invalidFields,
      allowedFields: [...tailoringGenerateFields],
    });
  }
  return [...new Set(fields)] as TailoringGenerateField[];
};

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
    const err = toJobsRouteError(error, {
      invalidRequestFallbackMessage: "Invalid job PDF upload request",
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
      const fields = parseTailoringGenerateFields(
        req.query.fields as string | undefined,
      );

      if (isDemoMode()) {
        const result = await simulateSummarizeJob(req.params.id, {
          force,
          fields,
        });
        if (!result.success) {
          return fail(
            res,
            badRequest(result.error ?? "Failed to summarize the job"),
          );
        }
        const job = await requireJob(req.params.id);
        return okWithMeta(res, await hydrateJobPdfFreshness(job), {
          simulated: true,
        });
      }

      const previousJob = await requireJob(req.params.id);
      const result = await summarizeJob(req.params.id, { force, fields });

      if (!result.success) {
        return fail(
          res,
          badRequest(result.error ?? "Failed to summarize the job"),
        );
      }

      const job = await requireJob(req.params.id);
      ok(res, await hydrateJobPdfFreshness(job));

      queueTailoringAutoPdfRegenerationIfNeeded(
        previousJob,
        job,
        "POST /api/jobs/:id/summarize",
      );
    } catch (error) {
      fail(res, toJobsRouteError(error));
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
        const job = await requireJob(req.params.id);
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

      const job = await requireJob(req.params.id);
      ok(res, await hydrateJobPdfFreshness(job));
    } catch (error) {
      fail(res, toJobsRouteError(error));
    }
  },
);
