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
import { getSetting } from "@server/repositories/settings";
import { setBackupSettings } from "@server/services/backup/index";
import { LlmService } from "@server/services/llm/service";
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

function normalizeLlmProviderValue(
  provider: string | null | undefined,
): string | undefined {
  if (!provider) return undefined;
  return provider.trim().toLowerCase().replace(/-/g, "_");
}

function getDefaultValidationBaseUrl(
  provider: string | undefined,
): string | undefined {
  if (provider === "lmstudio") return "http://localhost:1234";
  if (provider === "ollama") return "http://localhost:11434";
  if (provider === "openai_compatible") return "https://api.openai.com";
  return undefined;
}

async function resolveLlmConfig(input: {
  provider?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
}): Promise<{
  provider: string | undefined;
  apiKey: string | null;
  baseUrl: string | undefined;
}> {
  const [storedApiKey, storedProvider, storedBaseUrl] = await Promise.all([
    getSetting("llmApiKey"),
    getSetting("llmProvider"),
    getSetting("llmBaseUrl"),
  ]);

  const provider = normalizeLlmProviderValue(
    input.provider?.trim() || storedProvider?.trim() || undefined,
  );
  const usesBaseUrl =
    provider === "lmstudio" ||
    provider === "ollama" ||
    provider === "openai_compatible";
  const hasExplicitBaseUrlOverride =
    input.baseUrl !== undefined && input.baseUrl !== null;
  const baseUrl = usesBaseUrl
    ? hasExplicitBaseUrlOverride
      ? input.baseUrl?.trim() || getDefaultValidationBaseUrl(provider)
      : storedBaseUrl?.trim() || getDefaultValidationBaseUrl(provider)
    : undefined;

  return {
    provider,
    apiKey: input.apiKey?.trim() || storedApiKey?.trim() || null,
    baseUrl,
  };
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

settingsRouter.post(
  "/llm-models",
  asyncRoute(async (req: Request, res: Response) => {
    if (isDemoMode()) {
      ok(res, { models: [] });
      return;
    }

    const provider =
      typeof req.body?.provider === "string" ? req.body.provider : undefined;
    const apiKey =
      typeof req.body?.apiKey === "string" ? req.body.apiKey : undefined;
    const baseUrl =
      typeof req.body?.baseUrl === "string" ? req.body.baseUrl : undefined;
    const resolved = await resolveLlmConfig({ provider, apiKey, baseUrl });

    const llm = new LlmService({
      provider: resolved.provider,
      apiKey: resolved.apiKey,
      baseUrl: resolved.baseUrl,
    });

    try {
      const models = await llm.listModels();
      ok(res, { models });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch available LLM models.";
      logger.warn("LLM model discovery failed", {
        requestId: getRequestId() ?? null,
        route: "POST /api/settings/llm-models",
        provider: resolved.provider ?? null,
        hasBaseUrl: Boolean(resolved.baseUrl),
        hasApiKey: Boolean(resolved.apiKey),
        message,
      });
      fail(
        res,
        /api key is missing/i.test(message)
          ? badRequest(message)
          : upstreamError(message),
      );
    }
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
