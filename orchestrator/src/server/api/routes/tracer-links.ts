import { badRequest, notFound } from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { type Request, type Response, Router } from "express";
import { z } from "zod";
import * as jobsRepo from "../../repositories/jobs";
import {
  getJobTracerLinksAnalytics,
  getTracerAnalytics,
  getTracerReadiness,
} from "../../services/tracer-links";

export const tracerLinksRouter = Router();

const querySchema = z.object({
  jobId: z.string().trim().min(1).max(255).optional(),
  from: z.coerce.number().int().min(0).optional(),
  to: z.coerce.number().int().min(0).optional(),
  includeBots: z
    .preprocess((value) => {
      if (value === undefined) return false;
      if (typeof value === "boolean") return value;
      const lowered = String(value).trim().toLowerCase();
      return lowered === "1" || lowered === "true" || lowered === "yes";
    }, z.boolean())
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const paramsSchema = z.object({
  jobId: z.string().trim().min(1).max(255),
});

const readinessQuerySchema = z.object({
  force: z
    .preprocess((value) => {
      if (value === undefined) return false;
      if (typeof value === "boolean") return value;
      const lowered = String(value).trim().toLowerCase();
      return lowered === "1" || lowered === "true" || lowered === "yes";
    }, z.boolean())
    .optional(),
});

function assertTimeRange(
  from: number | undefined,
  to: number | undefined,
): string | null {
  if (typeof from === "number" && typeof to === "number" && from > to) {
    return "`from` must be less than or equal to `to`.";
  }
  return null;
}

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

tracerLinksRouter.get(
  "/readiness",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = readinessQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, badRequest(parsed.error.message, parsed.error.flatten()));
      return;
    }

    const readiness = await getTracerReadiness({
      requestOrigin: resolveRequestOrigin(req),
      force: parsed.data.force ?? false,
    });

    ok(res, readiness);
  }),
);

tracerLinksRouter.get(
  "/analytics",
  asyncRoute(async (req: Request, res: Response) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      fail(res, badRequest(parsed.error.message, parsed.error.flatten()));
      return;
    }

    const rangeError = assertTimeRange(parsed.data.from, parsed.data.to);
    if (rangeError) {
      fail(res, badRequest(rangeError));
      return;
    }

    const analytics = await getTracerAnalytics({
      jobId: parsed.data.jobId ?? null,
      from: parsed.data.from ?? null,
      to: parsed.data.to ?? null,
      includeBots: parsed.data.includeBots ?? false,
      limit: parsed.data.limit ?? 20,
    });

    ok(res, analytics);
  }),
);

tracerLinksRouter.get(
  "/jobs/:jobId",
  asyncRoute(async (req: Request, res: Response) => {
    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      fail(
        res,
        badRequest(parsedParams.error.message, parsedParams.error.flatten()),
      );
      return;
    }

    const parsedQuery = querySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      fail(
        res,
        badRequest(parsedQuery.error.message, parsedQuery.error.flatten()),
      );
      return;
    }

    const rangeError = assertTimeRange(
      parsedQuery.data.from,
      parsedQuery.data.to,
    );
    if (rangeError) {
      fail(res, badRequest(rangeError));
      return;
    }

    const job = await jobsRepo.getJobById(parsedParams.data.jobId);
    if (!job) {
      fail(res, notFound("Job not found"));
      return;
    }

    const analytics = await getJobTracerLinksAnalytics({
      jobId: job.id,
      title: job.title,
      employer: job.employer,
      tracerLinksEnabled: job.tracerLinksEnabled,
      from: parsedQuery.data.from ?? null,
      to: parsedQuery.data.to ?? null,
      includeBots: parsedQuery.data.includeBots ?? false,
    });

    ok(res, analytics);
  }),
);
