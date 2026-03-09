import { notFound } from "@infra/errors";
import { fail } from "@infra/http";
import * as visaSponsors from "@server/services/visa-sponsors/index";
import type {
  ApiResponse,
  VisaSponsorSearchResponse,
  VisaSponsorStatusResponse,
} from "@shared/types";
import { normalizeCountryKey } from "@shared/location-support.js";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

export const visaSponsorsRouter = Router();

/**
 * GET /api/visa-sponsors/status - Get status of all registered providers
 */
visaSponsorsRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const status = await visaSponsors.getStatus();
    const response: ApiResponse<VisaSponsorStatusResponse> = {
      ok: true,
      data: status,
    };
    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
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

    const response: ApiResponse<VisaSponsorSearchResponse> = {
      ok: true,
      data: {
        results,
        query: input.query,
        total: results.length,
      },
    };
    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/visa-sponsors/organization/:name - Get all entries for an organization
 */
visaSponsorsRouter.get(
  "/organization/:name",
  async (req: Request, res: Response) => {
    try {
      const name = decodeURIComponent(req.params.name);
      const entries = await visaSponsors.getOrganizationDetails(name);

      if (entries.length === 0) {
        return fail(res, notFound("Organization not found"));
      }

      res.json({
        success: true,
        data: entries,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
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
      return res.status(500).json({ success: false, error: result.message });
    }

    res.json({
      success: true,
      data: {
        message: result.message,
        status: await visaSponsors.getStatus(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

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
        return res.status(500).json({ success: false, error: result.message });
      }

      res.json({
        success: true,
        data: {
          message: result.message,
          status: await visaSponsors.getStatus(),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      res.status(500).json({ success: false, error: message });
    }
  },
);
