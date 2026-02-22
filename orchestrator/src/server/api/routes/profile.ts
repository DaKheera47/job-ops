import { ok } from "@infra/http";
import { isDemoMode } from "@server/config/demo";
import { DEMO_PROJECT_CATALOG } from "@server/config/demo-defaults";
import { getSetting } from "@server/repositories/settings";
import { clearProfileCache, getProfile } from "@server/services/profile";
import { extractProjectsFromProfile } from "@server/services/resumeProjects";
import { getResume, RxResumeAuthConfigError } from "@server/services/rxresume";
import { type Request, type Response, Router } from "express";

export const profileRouter = Router();

/**
 * GET /api/profile/projects - Get all projects available in the base resume
 */
profileRouter.get("/projects", async (_req: Request, res: Response) => {
  try {
    if (isDemoMode()) {
      res.json({ success: true, data: DEMO_PROJECT_CATALOG });
      return;
    }
    const profile = await getProfile();
    const { catalog } = extractProjectsFromProfile(profile);
    ok(res, catalog);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/profile - Get the full base resume profile
 */
profileRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const profile = await getProfile();
    ok(res, profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/profile/status - Check if base resume is configured and accessible
 */
profileRouter.get("/status", async (_req: Request, res: Response) => {
  try {
    const rxresumeBaseResumeId = await getSetting("rxresumeBaseResumeId");

    if (!rxresumeBaseResumeId) {
      ok(res, {
        exists: false,
        error:
          "No base resume selected. Please select a resume from your RxResume account in Settings.",
      });
      return;
    }

    // Verify the resume is accessible
    try {
      const resume = await getResume(rxresumeBaseResumeId);
      if (!resume.data || typeof resume.data !== "object") {
        ok(res, {
          exists: false,
          error: "Selected resume is empty or invalid.",
        });
        return;
      }

      ok(res, { exists: true, error: null });
    } catch (error) {
      if (error instanceof RxResumeAuthConfigError) {
        ok(res, { exists: false, error: error.message });
        return;
      }
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    ok(res, { exists: false, error: message });
  }
});

/**
 * POST /api/profile/refresh - Clear profile cache and refetch from RxResume v4 API
 */
profileRouter.post("/refresh", async (_req: Request, res: Response) => {
  try {
    clearProfileCache();
    const profile = await getProfile(true);
    ok(res, profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});
