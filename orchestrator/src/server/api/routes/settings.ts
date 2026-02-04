import { logger } from "@infra/logger";
import { setBackupSettings } from "@server/services/backup/index";
import { extractProjectsFromProfile } from "@server/services/resumeProjects";
import {
  getResume,
  listResumes,
  RxResumeCredentialsError,
} from "@server/services/rxresume-v4";
import { getEffectiveSettings } from "@server/services/settings";
import { applySettingsUpdates } from "@server/services/settings-update";
import { updateSettingsSchema } from "@shared/settings-schema";
import { type Request, type Response, Router } from "express";

export const settingsRouter = Router();

/**
 * GET /api/settings - Get app settings (effective + defaults)
 */
settingsRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const data = await getEffectiveSettings();
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * PATCH /api/settings - Update settings overrides
 */
settingsRouter.patch("/", async (req: Request, res: Response) => {
  try {
    const input = updateSettingsSchema.parse(req.body);
    const plan = await applySettingsUpdates(input);

    const data = await getEffectiveSettings();

    if (plan.shouldRefreshBackupScheduler) {
      setBackupSettings({
        enabled: data.backupEnabled,
        hour: data.backupHour,
        maxCount: data.backupMaxCount,
      });
    }
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * GET /api/settings/rx-resumes - Fetch list of resumes from Reactive Resume v4 API
 */
settingsRouter.get("/rx-resumes", async (_req: Request, res: Response) => {
  try {
    const resumes = await listResumes();

    // Map to expected format (id, name)
    res.json({
      success: true,
      data: {
        resumes: resumes.map((resume) => ({
          id: resume.id,
          name: resume.name,
        })),
      },
    });
  } catch (error) {
    if (error instanceof RxResumeCredentialsError) {
      res.status(400).json({ success: false, error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Failed to fetch Reactive Resumes", { message });
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/settings/rx-resumes/:id/projects - Fetch project catalog from RxResume v4
 */
settingsRouter.get(
  "/rx-resumes/:id/projects",
  async (req: Request, res: Response) => {
    try {
      const resumeId = req.params.id;
      if (!resumeId) {
        res
          .status(400)
          .json({ success: false, error: "Resume id is required." });
        return;
      }

      const resume = await getResume(resumeId);
      const profile = resume.data ?? {};
      const { catalog } = extractProjectsFromProfile(profile);

      res.json({ success: true, data: { projects: catalog } });
    } catch (error) {
      if (error instanceof RxResumeCredentialsError) {
        res.status(400).json({ success: false, error: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error("Failed to fetch RxResume projects", { message });
      res.status(500).json({ success: false, error: message });
    }
  },
);
