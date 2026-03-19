import {
  AppError,
  badRequest,
  serviceUnavailable,
  statusToCode,
  unauthorized,
  upstreamError,
} from "@infra/errors";
import { asyncRoute, fail, ok } from "@infra/http";
import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import { isDemoMode, sendDemoBlocked } from "@server/config/demo";
import { setBackupSettings } from "@server/services/backup/index";
import { clearProfileCache } from "@server/services/profile";
import {
  clearRxResumeResumeCache,
  extractProjectsFromResume,
  getResume,
  listResumes,
  RxResumeAuthConfigError,
  RxResumeRequestError,
  validateResumeSchema,
  validateCredentials as validateRxResumeCredentials,
} from "@server/services/rxresume";
import { getEffectiveSettings } from "@server/services/settings";
import { applySettingsUpdates } from "@server/services/settings-update";
import {
  type UpdateSettingsInput,
  updateSettingsSchema,
} from "@shared/settings-schema";
import { type Request, type Response, Router } from "express";

export const settingsRouter = Router();

const RXRESUME_SAVE_VALIDATION_KEYS: Array<keyof UpdateSettingsInput> = [
  "rxresumeMode",
  "rxresumeUrl",
  "rxresumeApiKey",
  "rxresumeEmail",
  "rxresumePassword",
];

function hasInputKey<K extends keyof UpdateSettingsInput>(
  input: UpdateSettingsInput,
  key: K,
): boolean {
  return Object.hasOwn(input, key);
}

function shouldValidateRxResumeOnSave(input: UpdateSettingsInput): boolean {
  return RXRESUME_SAVE_VALIDATION_KEYS.some((key) => hasInputKey(input, key));
}

function isMissingRxResumeConfigValidationResult(input: {
  status: number;
  message: string;
}): boolean {
  return input.status === 400 && /not configured/i.test(input.message);
}

function buildRxResumeValidationOptions(
  input: UpdateSettingsInput,
): Parameters<typeof validateRxResumeCredentials>[0] {
  return {
    mode:
      input.rxresumeMode === "v4" || input.rxresumeMode === "v5"
        ? input.rxresumeMode
        : undefined,
    v4: {
      ...(hasInputKey(input, "rxresumeEmail")
        ? { email: input.rxresumeEmail }
        : {}),
      ...(hasInputKey(input, "rxresumePassword")
        ? { password: input.rxresumePassword }
        : {}),
      ...(hasInputKey(input, "rxresumeUrl")
        ? { baseUrl: input.rxresumeUrl }
        : {}),
    },
    v5: {
      ...(hasInputKey(input, "rxresumeApiKey")
        ? { apiKey: input.rxresumeApiKey }
        : {}),
      ...(hasInputKey(input, "rxresumeUrl")
        ? { baseUrl: input.rxresumeUrl }
        : {}),
    },
  };
}

function toRxResumeValidationAppError(
  status: number,
  message: string,
): AppError {
  if (status === 401) {
    return unauthorized(message);
  }

  if (status === 400) {
    return badRequest(message);
  }

  return new AppError({
    status,
    code: statusToCode(status),
    message,
  });
}

/**
 * GET /api/settings - Get app settings (effective + defaults)
 */
settingsRouter.get(
  "/",
  asyncRoute(async (_req: Request, res: Response) => {
    const data = await getEffectiveSettings();
    ok(res, data);
  }),
);

/**
 * PATCH /api/settings - Update settings overrides
 */
settingsRouter.patch(
  "/",
  asyncRoute(async (req: Request, res: Response) => {
    if (isDemoMode()) {
      return sendDemoBlocked(
        res,
        "Saving settings is disabled in the public demo.",
        { route: "PATCH /api/settings" },
      );
    }

    const input = updateSettingsSchema.parse(req.body);
    if (shouldValidateRxResumeOnSave(input)) {
      const validation = await validateRxResumeCredentials(
        buildRxResumeValidationOptions(input),
      );
      if (!validation.ok) {
        const status = validation.status ?? 0;
        if (
          isMissingRxResumeConfigValidationResult({
            status,
            message: validation.message,
          })
        ) {
          logger.info(
            "Skipping save-time Reactive Resume validation because credentials are incomplete",
            {
              requestId: getRequestId() ?? null,
              route: "PATCH /api/settings",
              rxresumeMode: validation.mode ?? input.rxresumeMode ?? null,
              status,
            },
          );
        } else if (status >= 400 && status < 500) {
          fail(res, toRxResumeValidationAppError(status, validation.message));
          return;
        } else if (status === 0 || status >= 500) {
          logger.warn(
            "Reactive Resume save-time validation could not verify upstream availability",
            {
              requestId: getRequestId() ?? null,
              route: "PATCH /api/settings",
              rxresumeMode: validation.mode ?? input.rxresumeMode ?? null,
              status,
            },
          );
        }
      }
    }

    const plan = await applySettingsUpdates(input);
    if (plan.shouldClearRxResumeCaches) {
      clearRxResumeResumeCache();
      clearProfileCache();
    }

    const data = await getEffectiveSettings();

    if (plan.shouldRefreshBackupScheduler) {
      setBackupSettings({
        enabled: data.backupEnabled.value,
        hour: data.backupHour.value,
        maxCount: data.backupMaxCount.value,
      });
    }
    ok(res, data);
  }),
);

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
