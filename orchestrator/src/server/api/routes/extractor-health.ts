import { AppError, notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { checkExtractorHealth } from "@server/services/extractor-health";
import { isExtractorSourceId } from "@shared/extractors";
import { type Request, type Response, Router } from "express";

export const extractorHealthRouter = Router();

extractorHealthRouter.get(
  "/:source/health",
  asyncRoute(async (req: Request, res: Response) => {
    const rawSource = req.params.source?.trim().toLowerCase() ?? "";
    if (!isExtractorSourceId(rawSource)) {
      return fail(res, notFound(`Extractor source not found: ${rawSource}`));
    }

    const result = await checkExtractorHealth(rawSource);
    if (!result) {
      return fail(
        res,
        notFound(`Extractor source is not available at runtime: ${rawSource}`),
      );
    }

    if (!result.healthy) {
      return fail(
        res,
        new AppError({
          status: 503,
          code: "SERVICE_UNAVAILABLE",
          message: result.errorMessage ?? "Extractor health check failed.",
          details: result.response,
        }),
      );
    }

    ok(res, result.response);
  }),
);
