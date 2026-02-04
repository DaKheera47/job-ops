import type {
  ApiResponse,
  VisaSponsorSearchResponse,
  VisaSponsorStatusResponse,
} from "@shared/types";
import { type Request, type Response, Router } from "express";
import { z } from "zod";

import * as visaSponsors from "../../services/visa-sponsors/index";

export const visaSponsorsRouter = Router();

/**
 * GET /api/visa-sponsors/status - Get status of the visa sponsor service
 */
visaSponsorsRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const status = visaSponsors.getStatus();
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
 */
const visaSponsorSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
});

visaSponsorsRouter.post("/search", async (req: Request, res: Response) => {
  try {
    const input = visaSponsorSearchSchema.parse(req.body);

    const results = visaSponsors.searchSponsors(input.query, {
      limit: input.limit,
      minScore: input.minScore,
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
      const entries = visaSponsors.getOrganizationDetails(name);

      if (entries.length === 0) {
        return res
          .status(404)
          .json({ success: false, error: "Organization not found" });
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
 * POST /api/visa-sponsors/update - Trigger a manual update of the visa sponsor list
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
        status: visaSponsors.getStatus(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});
