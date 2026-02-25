import { ok, okWithMeta } from "@infra/http";
import { logger } from "@infra/logger";
import { isDemoMode } from "@server/config/demo";
import { getSetting } from "@server/repositories/settings";
import { LlmService } from "@server/services/llm/service";
import {
  getResume,
  RxResumeAuthConfigError,
  validateResumeSchema,
  validateCredentials as validateRxResumeCredentials,
} from "@server/services/rxresume";
import { getConfiguredRxResumeBaseResumeId } from "@server/services/rxresume/baseResumeId";
import { type Request, type Response, Router } from "express";

export const onboardingRouter = Router();

type ValidationResponse = {
  valid: boolean;
  message: string | null;
};

async function validateLlm(options: {
  apiKey?: string | null;
  provider?: string | null;
  baseUrl?: string | null;
}): Promise<ValidationResponse> {
  const [storedApiKey, storedProvider, storedBaseUrl] = await Promise.all([
    getSetting("llmApiKey"),
    getSetting("llmProvider"),
    getSetting("llmBaseUrl"),
  ]);

  const normalizedProvider =
    options.provider?.trim() || storedProvider?.trim() || undefined;
  const shouldUseBaseUrl =
    normalizedProvider === "lmstudio" || normalizedProvider === "ollama";
  const resolvedBaseUrl = shouldUseBaseUrl
    ? options.baseUrl?.trim() || storedBaseUrl?.trim() || undefined
    : undefined;
  const resolvedApiKey = options.apiKey?.trim() || storedApiKey?.trim() || null;

  logger.debug("LLM onboarding validation resolved config", {
    provider: normalizedProvider ?? null,
    usesBaseUrl: shouldUseBaseUrl,
    hasBaseUrl: Boolean(resolvedBaseUrl),
    hasApiKey: Boolean(resolvedApiKey),
  });

  const llm = new LlmService({
    apiKey: resolvedApiKey,
    provider: normalizedProvider,
    baseUrl: resolvedBaseUrl,
  });
  return llm.validateCredentials();
}

/**
 * Validate that a base resume is configured and accessible via Reactive Resume.
 */
async function validateResumeConfig(): Promise<ValidationResponse> {
  try {
    // Check if rxresumeBaseResumeId is configured
    const { resumeId: rxresumeBaseResumeId } =
      await getConfiguredRxResumeBaseResumeId();

    if (!rxresumeBaseResumeId) {
      return {
        valid: false,
        message:
          "No base resume selected. Please select a resume from your RxResume account in Settings.",
      };
    }

    // Verify the resume is accessible and valid
    try {
      const resume = await getResume(rxresumeBaseResumeId);

      if (!resume.data || typeof resume.data !== "object") {
        return {
          valid: false,
          message: "Selected resume is empty or invalid.",
        };
      }

      const validated = await validateResumeSchema(resume.data);
      if (!validated.ok) {
        return { valid: false, message: validated.message };
      }

      return { valid: true, message: null };
    } catch (error) {
      if (error instanceof RxResumeAuthConfigError) {
        return {
          valid: false,
          message: error.message,
        };
      }
      const message =
        error instanceof Error
          ? error.message
          : "Failed to fetch resume from RxResume.";
      return { valid: false, message };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Resume validation failed.";
    return { valid: false, message };
  }
}

async function validateRxresume(options?: {
  mode?: string | null;
  email?: string | null;
  password?: string | null;
  apiKey?: string | null;
  baseUrl?: string | null;
}): Promise<ValidationResponse> {
  const rawMode = options?.mode?.trim();
  const mode = rawMode === "v4" || rawMode === "v5" ? rawMode : undefined;

  const result = await validateRxResumeCredentials({
    mode,
    v4: {
      email: options?.email ?? undefined,
      password: options?.password ?? undefined,
      baseUrl: options?.baseUrl ?? undefined,
    },
    v5: {
      apiKey: options?.apiKey ?? undefined,
      baseUrl: options?.baseUrl ?? undefined,
    },
  });

  if (result.ok) return { valid: true, message: null };

  const normalizedMessage = result.message.toLowerCase();
  if (
    result.status === 401 ||
    normalizedMessage.includes("invalidcredentials")
  ) {
    return {
      valid: false,
      message:
        "Invalid RxResume credentials. Check your configured Reactive Resume mode credentials and try again.",
    };
  }

  return { valid: false, message: result.message };
}

onboardingRouter.post(
  "/validate/openrouter",
  async (req: Request, res: Response) => {
    if (isDemoMode()) {
      return okWithMeta(
        res,
        {
          valid: true,
          message:
            "Demo mode: OpenRouter validation is simulated and always succeeds.",
        },
        { simulated: true },
      );
    }

    const apiKey =
      typeof req.body?.apiKey === "string" ? req.body.apiKey : undefined;
    const result = await validateLlm({ apiKey, provider: "openrouter" });
    res.json({ success: true, data: result });
  },
);

onboardingRouter.post("/validate/llm", async (req: Request, res: Response) => {
  if (isDemoMode()) {
    return okWithMeta(
      res,
      {
        valid: true,
        message: "Demo mode: LLM validation is simulated.",
      },
      { simulated: true },
    );
  }

  const apiKey =
    typeof req.body?.apiKey === "string" ? req.body.apiKey : undefined;
  const provider =
    typeof req.body?.provider === "string" ? req.body.provider : undefined;
  const baseUrl =
    typeof req.body?.baseUrl === "string" ? req.body.baseUrl : undefined;
  const result = await validateLlm({ apiKey, provider, baseUrl });
  res.json({ success: true, data: result });
});

onboardingRouter.post(
  "/validate/rxresume",
  async (req: Request, res: Response) => {
    if (isDemoMode()) {
      return okWithMeta(
        res,
        {
          valid: true,
          message: "Demo mode: RxResume validation is simulated.",
        },
        { simulated: true },
      );
    }

    const email =
      typeof req.body?.email === "string" ? req.body.email : undefined;
    const password =
      typeof req.body?.password === "string" ? req.body.password : undefined;
    const mode = typeof req.body?.mode === "string" ? req.body.mode : undefined;
    const apiKey =
      typeof req.body?.apiKey === "string" ? req.body.apiKey : undefined;
    const baseUrl =
      typeof req.body?.baseUrl === "string" ? req.body.baseUrl : undefined;
    const result = await validateRxresume({
      mode,
      email,
      password,
      apiKey,
      baseUrl,
    });
    ok(res, result);
  },
);

onboardingRouter.get(
  "/validate/resume",
  async (_req: Request, res: Response) => {
    if (isDemoMode()) {
      return okWithMeta(
        res,
        {
          valid: true,
          message: "Demo mode: resume validation is simulated.",
        },
        { simulated: true },
      );
    }

    const result = await validateResumeConfig();
    ok(res, result);
  },
);
