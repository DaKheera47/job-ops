import { asyncRoute, ok, okWithMeta } from "@infra/http";
import { logger } from "@infra/logger";
import { isDemoMode } from "@server/config/demo";
import { getSetting } from "@server/repositories/settings";
import { getDesignResumeStatus } from "@server/services/design-resume";
import { LlmService } from "@server/services/llm/service";
import { suggestOnboardingSearchTerms } from "@server/services/onboarding-search-terms";
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
  status?: number | null;
};

function getDefaultValidationBaseUrl(
  provider: string | undefined,
): string | undefined {
  if (provider === "lmstudio") return "http://localhost:1234";
  if (provider === "ollama") return "http://localhost:11434";
  if (provider === "openai_compatible") return "https://api.openai.com";
  return undefined;
}

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

  const normalizedProvider = normalizeLlmProviderValue(
    options.provider?.trim() || storedProvider?.trim() || undefined,
  );
  const shouldUseBaseUrl =
    normalizedProvider === "lmstudio" ||
    normalizedProvider === "ollama" ||
    normalizedProvider === "openai_compatible";
  const hasExplicitBaseUrlOverride =
    options.baseUrl !== undefined && options.baseUrl !== null;
  const resolvedBaseUrl = shouldUseBaseUrl
    ? hasExplicitBaseUrlOverride
      ? options.baseUrl?.trim() ||
        getDefaultValidationBaseUrl(normalizedProvider)
      : storedBaseUrl?.trim() || undefined
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

function normalizeLlmProviderValue(
  provider: string | undefined,
): string | undefined {
  if (!provider) return undefined;
  return provider.toLowerCase().replace(/-/g, "_");
}

/**
 * Validate that a base resume is configured and accessible via Reactive Resume.
 */
async function validateResumeConfig(): Promise<ValidationResponse> {
  try {
    const localStatus = await getDesignResumeStatus();
    if (localStatus.exists) {
      return { valid: true, message: null };
    }

    // Check if rxresumeBaseResumeId is configured
    const { resumeId: rxresumeBaseResumeId } =
      await getConfiguredRxResumeBaseResumeId();

    if (!rxresumeBaseResumeId) {
      return {
        valid: false,
        message:
          "No local resume is ready yet. Upload a PDF or DOCX resume, or connect Reactive Resume and select a template resume.",
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
  apiKey?: string | null;
  baseUrl?: string | null;
}): Promise<ValidationResponse> {
  const requestApiKey = options?.apiKey?.trim() ?? "";
  const hasExplicitV5Input = options?.apiKey !== undefined;

  const storedBaseUrl = await getSetting("rxresumeUrl");
  const resolvedBaseUrl =
    options?.baseUrl !== undefined && options?.baseUrl !== null
      ? options.baseUrl.trim() ||
        process.env.RXRESUME_URL?.trim() ||
        "https://rxresu.me"
      : storedBaseUrl?.trim() ||
        process.env.RXRESUME_URL?.trim() ||
        "https://rxresu.me";

  if (hasExplicitV5Input && !requestApiKey) {
    return {
      valid: false,
      status: 400,
      message: "Reactive Resume v5 API key is not configured.",
    };
  }

  const result = await validateRxResumeCredentials({
    v5: {
      apiKey: options?.apiKey ?? undefined,
      baseUrl: options?.baseUrl ?? undefined,
    },
  });

  if (result.ok) return { valid: true, message: null, status: null };

  const normalizedMessage = result.message.toLowerCase();
  if (result.status === 400 && normalizedMessage.includes("not configured")) {
    return {
      valid: false,
      status: 400,
      message: result.message,
    };
  }

  if (
    result.status === 401 ||
    normalizedMessage.includes("invalidcredentials")
  ) {
    return {
      valid: false,
      status: result.status,
      message:
        "Reactive Resume v5 API key is invalid. Update the API key and try again.",
    };
  }

  if (result.status === 0 || result.status >= 500) {
    return {
      valid: false,
      status: result.status,
      message: `JobOps could not verify Reactive Resume because the instance at ${resolvedBaseUrl} is unavailable right now.`,
    };
  }

  if (result.status >= 400 && result.status < 500) {
    return {
      valid: false,
      status: result.status,
      message: `Reactive Resume returned HTTP ${result.status} from ${resolvedBaseUrl}. Check the configured URL.`,
    };
  }

  return {
    valid: false,
    message: result.message,
    status: result.status,
  };
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
    ok(res, result);
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
  ok(res, result);
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

    const apiKey =
      typeof req.body?.apiKey === "string" ? req.body.apiKey : undefined;
    const baseUrl =
      typeof req.body?.baseUrl === "string" ? req.body.baseUrl : undefined;
    const result = await validateRxresume({
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

onboardingRouter.post(
  "/search-terms/suggest",
  asyncRoute(async (_req: Request, res: Response) => {
    if (isDemoMode()) {
      return okWithMeta(
        res,
        {
          terms: [
            "Product Engineer",
            "Full Stack Engineer",
            "Frontend Engineer",
            "Backend Engineer",
            "Software Engineer",
          ],
          source: "fallback",
        },
        { simulated: true },
      );
    }

    const result = await suggestOnboardingSearchTerms();
    ok(res, result);
  }),
);
