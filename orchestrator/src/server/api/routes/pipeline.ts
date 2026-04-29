import {
  AppError,
  badRequest,
  conflict,
  notFound,
  requestTimeout,
  serviceUnavailable,
} from "@infra/errors";
import { fail, ok, okWithMeta } from "@infra/http";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { setupSse, startSseHeartbeat, writeSseData } from "@infra/sse";
import { isDemoMode } from "@server/config/demo";
import {
  type ExtractorRegistry,
  getExtractorRegistry,
} from "@server/extractors/registry";
import {
  getPipelineStatus,
  getProgress,
  requestPipelineCancel,
  runPipeline,
  subscribeToProgress,
} from "@server/pipeline/index";
import * as pipelineRepo from "@server/repositories/pipeline";
import { trackCanonicalActivationEvent } from "@server/services/activation-funnel";
import { simulatePipelineRun } from "@server/services/demo-simulator";
import { PIPELINE_EXTRACTOR_SOURCE_IDS } from "@shared/extractors";
import {
  createLocationIntent,
  planLocationSources,
} from "@shared/location-intelligence.js";
import {
  LOCATION_MATCH_STRICTNESS_VALUES,
  LOCATION_SEARCH_SCOPE_VALUES,
} from "@shared/location-preferences.js";
import type {
  PipelineProgressState,
  PipelineStatusResponse,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const pipelineRouter = Router();
const WORKPLACE_TYPE_VALUES = ["remote", "hybrid", "onsite"] as const;

function resolveRequestOrigin(req: Request): string | null {
  const configuredBaseUrl = process.env.JOBOPS_PUBLIC_BASE_URL?.trim();
  if (configuredBaseUrl) {
    try {
      const parsed = new URL(configuredBaseUrl);
      if (parsed.protocol && parsed.host) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // Ignore invalid env and fall back to request-derived origin.
    }
  }

  const trustProxy = Boolean(req.app?.get("trust proxy"));
  let protocol = (req.protocol || "").trim();
  let host = (req.header("host") || "").trim();

  if (trustProxy) {
    const forwardedProto =
      req.header("x-forwarded-proto")?.split(",")[0]?.trim() ?? "";
    const forwardedHost =
      req.header("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
    if (forwardedProto) protocol = forwardedProto;
    if (forwardedHost) host = forwardedHost;
  }

  if (!host || !protocol) return null;
  return `${protocol}://${host}`;
}

/**
 * GET /api/pipeline/status - Get pipeline status
 */
pipelineRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const { isRunning } = getPipelineStatus();
    const lastRun = await pipelineRepo.getLatestPipelineRun();
    const data: PipelineStatusResponse = {
      isRunning,
      lastRun,
      nextScheduledRun: null,
    };
    ok(res, data);
  } catch (error) {
    fail(
      res,
      new AppError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
});

/**
 * GET /api/pipeline/progress/snapshot - Get the current pipeline progress state
 */
pipelineRouter.get("/progress/snapshot", (_req: Request, res: Response) => {
  try {
    const data: PipelineProgressState = getProgress();
    ok(res, data);
  } catch (error) {
    fail(
      res,
      new AppError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
});

/**
 * GET /api/pipeline/progress - Server-Sent Events endpoint for live progress
 */
pipelineRouter.get("/progress", (req: Request, res: Response) => {
  setupSse(res, {
    cacheControl: "no-cache, no-transform",
    disableBuffering: true,
    flushHeaders: true,
  });

  // Send initial progress
  const sendProgress = (data: unknown) => {
    writeSseData(res, data);
  };

  // Subscribe to progress updates
  const unsubscribe = subscribeToProgress(sendProgress);

  // Send heartbeat every 30 seconds to keep connection alive
  const stopHeartbeat = startSseHeartbeat(res);

  // Cleanup on close
  req.on("close", () => {
    stopHeartbeat();
    unsubscribe();
  });
});

/**
 * GET /api/pipeline/runs - Get recent pipeline runs
 */
pipelineRouter.get("/runs", async (_req: Request, res: Response) => {
  try {
    const runs = await pipelineRepo.getRecentPipelineRuns(20);
    ok(res, runs);
  } catch (error) {
    fail(
      res,
      new AppError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
});

/**
 * GET /api/pipeline/runs/:id/insights - Get exact and inferred metrics for a run
 */
pipelineRouter.get(
  "/runs/:id/insights",
  async (req: Request, res: Response) => {
    try {
      const insights = await pipelineRepo.getPipelineRunInsights(req.params.id);
      if (!insights) {
        return fail(res, notFound("Pipeline run not found"));
      }
      ok(res, insights);
    } catch (error) {
      fail(
        res,
        new AppError({
          status: 500,
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
      );
    }
  },
);

/**
 * POST /api/pipeline/run - Trigger the pipeline manually
 */
const runPipelineSchema = z.object({
  topN: z.number().min(1).max(50).optional(),
  minSuitabilityScore: z.number().min(0).max(100).optional(),
  sources: z
    .array(
      z.enum(
        PIPELINE_EXTRACTOR_SOURCE_IDS as [
          (typeof PIPELINE_EXTRACTOR_SOURCE_IDS)[number],
          ...(typeof PIPELINE_EXTRACTOR_SOURCE_IDS)[number][],
        ],
      ),
    )
    .min(1)
    .optional(),
  runBudget: z.number().min(50).max(1000).optional(),
  searchTerms: z.array(z.string().trim().min(1)).optional(),
  country: z.string().trim().optional(),
  cityLocations: z.array(z.string().trim().min(1)).optional(),
  workplaceTypes: z
    .array(z.enum(WORKPLACE_TYPE_VALUES))
    .min(1)
    .max(3)
    .optional(),
  searchScope: z.enum(LOCATION_SEARCH_SCOPE_VALUES).optional(),
  matchStrictness: z.enum(LOCATION_MATCH_STRICTNESS_VALUES).optional(),
});

pipelineRouter.post("/run", async (req: Request, res: Response) => {
  try {
    const config = runPipelineSchema.parse(req.body);
    const locationIntent = createLocationIntent({
      selectedCountry: config.country,
      cityLocations: config.cityLocations,
      workplaceTypes: config.workplaceTypes,
      geoScope: config.searchScope,
      matchStrictness: config.matchStrictness,
    });
    if (config.sources && config.sources.length > 0) {
      let registry: ExtractorRegistry;
      try {
        registry = await getExtractorRegistry();
      } catch (error) {
        logger.error(
          "Extractor registry unavailable during source validation",
          {
            route: "/api/pipeline/run",
            error,
          },
        );
        return fail(
          res,
          serviceUnavailable(
            "Extractor registry is unavailable. Try again after fixing startup errors.",
          ),
        );
      }
      const unavailableSources = config.sources.filter(
        (source) => !registry.manifestBySource.has(source),
      );
      if (unavailableSources.length > 0) {
        return fail(
          res,
          badRequest(
            `Requested sources are not available at runtime: ${unavailableSources.join(", ")}`,
            { unavailableSources },
          ),
        );
      }

      const sourcePlans = planLocationSources({
        intent: locationIntent,
        sources: config.sources,
      });
      if (sourcePlans.incompatibleSources.length > 0) {
        const incompatible = sourcePlans.plans
          .filter((plan) => !plan.isCompatible)
          .map((plan) => ({
            source: plan.source,
            reasons: plan.reasons,
          }));

        return fail(
          res,
          badRequest(
            "Requested sources are incompatible with the selected location setup",
            { incompatibleSources: incompatible },
          ),
        );
      }
    }

    if (isDemoMode()) {
      const simulated = await simulatePipelineRun({
        topN: config.topN,
        minSuitabilityScore: config.minSuitabilityScore,
        sources: config.sources,
        locationIntent,
      });
      return okWithMeta(res, simulated, { simulated: true });
    }

    // Start pipeline in background
    runWithRequestContext({}, () => {
      runPipeline({
        topN: config.topN,
        minSuitabilityScore: config.minSuitabilityScore,
        sources: config.sources,
        locationIntent,
      }).catch((error) => {
        logger.error("Background pipeline run failed", error);
      });
    });
    void trackCanonicalActivationEvent(
      "jobs_pipeline_run_started",
      {
        source_count: config.sources?.length,
        top_n: config.topN,
        min_suitability_score: config.minSuitabilityScore,
        country: config.country,
        has_city_locations: Array.isArray(config.cityLocations)
          ? config.cityLocations.length > 0
          : false,
        search_terms_count: config.searchTerms?.length,
      },
      {
        requestOrigin: resolveRequestOrigin(req),
        urlPath: "/jobs",
      },
    );
    ok(res, { message: "Pipeline started" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    if (error instanceof Error && error.name === "AbortError") {
      return fail(res, requestTimeout("Request timed out"));
    }
    fail(
      res,
      new AppError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
});

/**
 * POST /api/pipeline/cancel - Request cancellation of active pipeline run
 */
pipelineRouter.post("/cancel", async (_req: Request, res: Response) => {
  try {
    const cancelResult = requestPipelineCancel();
    if (!cancelResult.accepted) {
      return fail(res, conflict("No running pipeline to cancel"));
    }

    logger.info("Pipeline cancellation requested", {
      route: "/api/pipeline/cancel",
      action: "cancel",
      status: "accepted",
      pipelineRunId: cancelResult.pipelineRunId,
      alreadyRequested: cancelResult.alreadyRequested,
    });

    ok(res, {
      message: cancelResult.alreadyRequested
        ? "Pipeline cancellation already requested"
        : "Pipeline cancellation requested",
      pipelineRunId: cancelResult.pipelineRunId,
      alreadyRequested: cancelResult.alreadyRequested,
    });
  } catch (error) {
    fail(
      res,
      new AppError({
        status: 500,
        code: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
});
