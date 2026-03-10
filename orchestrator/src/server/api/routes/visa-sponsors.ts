import {
  badRequest,
  notFound,
  serviceUnavailable,
  toAppError,
} from "@infra/errors";
import { fail, ok } from "@infra/http";
import * as visaSponsors from "@server/services/visa-sponsors/index";
import { getVisaSponsorProviderRegistry } from "@server/services/visa-sponsors/providers/registry";
import { normalizeCountryKey } from "@shared/location-support.js";
import type {
  VisaSponsorSearchResponse,
  VisaSponsorStatusResponse,
} from "@shared/types";
import { isVisaSponsorProviderId } from "@shared/visa-sponsor-providers";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const visaSponsorsRouter = Router();

/**
 * GET /api/visa-sponsors/status - Get status of all registered providers
 */
visaSponsorsRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const status = await visaSponsors.getStatus();
    ok<VisaSponsorStatusResponse>(res, status);
  } catch (error) {
    fail(res, toAppError(error));
  }
});

/**
 * POST /api/visa-sponsors/search - Search for visa sponsors
 * Optional `country` field restricts results to a specific provider.
 */
const visaSponsorSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  country: z.string().optional(),
});

visaSponsorsRouter.post("/search", async (req: Request, res: Response) => {
  try {
    const input = visaSponsorSearchSchema.parse(req.body);
    const countryKey = input.country
      ? normalizeCountryKey(input.country)
      : undefined;

    const results = await visaSponsors.searchSponsors(input.query, {
      limit: input.limit,
      minScore: input.minScore,
      countryKey,
    });

    ok<VisaSponsorSearchResponse>(res, {
      results,
      query: input.query,
      total: results.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(res, badRequest(error.message, error.flatten()));
    }
    fail(res, toAppError(error));
  }
});

/**
 * GET /api/visa-sponsors/organization/:name - Get all entries for an organization
 */
visaSponsorsRouter.get(
  "/organization/:name",
  async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      const providerId =
        typeof req.query.providerId === "string"
          ? req.query.providerId
          : undefined;

      if (providerId) {
        if (!isVisaSponsorProviderId(providerId)) {
          return fail(res, badRequest(`Unknown provider '${providerId}'`));
        }

        const registry = await getVisaSponsorProviderRegistry();
        if (!registry.manifests.has(providerId)) {
          return fail(res, notFound(`Provider '${providerId}' not found`));
        }
      }

      const entries = await visaSponsors.getOrganizationDetails(
        name,
        providerId,
      );

      if (entries.length === 0) {
        return fail(res, notFound("Organization not found"));
      }

      ok(res, entries);
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);

/**
 * POST /api/visa-sponsors/update - Trigger a manual update for all providers
 */
visaSponsorsRouter.post("/update", async (_req: Request, res: Response) => {
  try {
    const result = await visaSponsors.downloadLatestCsv();

    if (!result.success) {
      return fail(
        res,
        result.code === "NO_PROVIDERS_REGISTERED"
          ? serviceUnavailable(result.message)
          : toAppError(new Error(result.message)),
      );
    }

    ok(res, {
      message: result.message,
      status: await visaSponsors.getStatus(),
    });
  } catch (error) {
    fail(res, toAppError(error));
  }
});

function mapUpdateProviderError(message: string) {
  return toAppError(new Error(message));
}

function mapUpdateProviderErrorCode(input: { code?: string; message: string }) {
  if (input.code === "PROVIDER_NOT_FOUND") {
    return notFound(input.message);
  }

  if (input.code === "NO_PROVIDERS_REGISTERED") {
    return serviceUnavailable(input.message);
  }

  return mapUpdateProviderError(input.message);
}

/**
 * POST /api/visa-sponsors/update/:providerId - Trigger a manual update for a specific provider
 */
visaSponsorsRouter.post(
  "/update/:providerId",
  async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      const result = await visaSponsors.downloadLatestCsv(providerId);

      if (!result.success) {
        return fail(
          res,
          mapUpdateProviderErrorCode({
            code: result.code,
            message: result.message,
          }),
        );
      }

      ok(res, {
        message: result.message,
        status: await visaSponsors.getStatus(),
      });
    } catch (error) {
      fail(res, toAppError(error));
    }
  },
);
