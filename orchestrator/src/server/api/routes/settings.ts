import {
  AppError,
  badRequest,
  serviceUnavailable,
  statusToCode,
  upstreamError,
} from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { isDemoMode, sendDemoBlocked } from "@server/config/demo";
import { setBackupSettings } from "@server/services/backup/index";
import {
  extractProjectsFromResume,
  getResume,
  listResumes,
  RxResumeAuthConfigError,
  RxResumeRequestError,
  validateResumeSchema,
} from "@server/services/rxresume";
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
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Saving settings is disabled in the public demo.",
        { route: "PATCH /api/settings" },
      );
    }

    const input = updateSettingsSchema.parse(req.body);
    const plan = await applySettingsUpdates(input);

    const data = await getEffectiveSettings();

    if (plan.shouldRefreshBackupScheduler) {
      setBackupSettings({
        enabled: data.backupEnabled.value,
        hour: data.backupHour.value,
        maxCount: data.backupMaxCount.value,
      });
    }
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * GET /api/settings/rx-resumes - Fetch list of resumes from Reactive Resume (v4/v5 adapter)
 */
function failRxResume(res: Response, error: unknown): void {
  if (error instanceof RxResumeAuthConfigError) {
    fail(res, badRequest(error.message));
    return;
  }
  if (error instanceof RxResumeRequestError) {
    if (error.status === 401) {
      fail(
        res,
        badRequest(
          "Reactive Resume authentication failed. Check your configured mode credentials.",
        ),
      );
      return;
    }
    if (error.status && error.status >= 500) {
      fail(res, upstreamError(error.message));
      return;
    }
    if (error.status && error.status >= 400 && error.status < 500) {
      fail(
        res,
        new AppError({
          status: error.status,
          code: statusToCode(error.status),
          message: error.message,
        }),
      );
      return;
    }
    if (error.status === 0) {
      fail(
        res,
        serviceUnavailable(
          "Reactive Resume is unavailable. Check the URL and try again.",
        ),
      );
      return;
    }
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  logger.error("Reactive Resume route request failed", { message, error });
  fail(res, upstreamError(message));
}

settingsRouter.get(
  "/rx-resumes",
  asyncRoute(async (req: Request, res: Response) => {
    try {
      const modeParam =
        typeof req.query.mode === "string" ? req.query.mode : undefined;
      const mode =
        modeParam === "v4" || modeParam === "v5" ? modeParam : undefined;
      const resumes = await listResumes({ mode });

      ok(res, {
        resumes: resumes.map((resume) => ({
          id: resume.id,
          name: resume.name,
        })),
      });
    } catch (error) {
      failRxResume(res, error);
    }
  }),
);

/**
 * GET /api/settings/rx-resumes/:id/projects - Fetch project catalog from Reactive Resume (v4/v5 adapter)
 */
settingsRouter.get(
  "/rx-resumes/:id/projects",
  asyncRoute(async (req: Request, res: Response) => {
    try {
      const resumeId = req.params.id;
      if (!resumeId) {
        fail(res, badRequest("Resume id is required."));
        return;
      }

      const modeParam =
        typeof req.query.mode === "string" ? req.query.mode : undefined;
      const mode =
        modeParam === "v4" || modeParam === "v5" ? modeParam : undefined;

      const resume = await getResume(resumeId, { mode });
      const validated = await validateResumeSchema(resume.data ?? {}, { mode });
      if (!validated.ok) {
        fail(res, badRequest(validated.message));
        return;
      }
      const { catalog } = extractProjectsFromResume(resume.data ?? {}, {
        mode: validated.mode,
      });

      ok(res, { projects: catalog });
    } catch (error) {
      failRxResume(res, error);
    }
  }),
);
