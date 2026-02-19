import { okWithMeta } from "@infra/http";
import { logger } from "@infra/logger";
import { getSetting } from "@server/repositories/settings";
import { LlmService } from "@server/services/llm-service";
import { RxResumeClient } from "@server/services/rxresume-client";
import {
  getResume,
  RxResumeCredentialsError,
} from "@server/services/rxresume-v4";
import { resumeDataSchema } from "@shared/rxresume-schema";
import { type Request, type Response, Router } from "express";
import { isDemoMode } from "../../config/demo";

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
 * Validate that a base resume is configured and accessible via RxResume v4 API.
 */
async function validateResumeConfig(): Promise<ValidationResponse> {
  try {
    // Check if rxresumeBaseResumeId is configured
    const rxresumeBaseResumeId = await getSetting("rxresumeBaseResumeId");

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

      // Validate against schema
      const result = resumeDataSchema.safeParse(resume.data);
      if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue?.path?.join(".") || "";
        const baseMessage =
          issue?.message ?? "Resume does not match the expected schema.";
        const details = path ? `Field "${path}": ${baseMessage}` : baseMessage;
        return { valid: false, message: details };
      }

      return { valid: true, message: null };
    } catch (error) {
      if (error instanceof RxResumeCredentialsError) {
        return {
          valid: false,
          message: "RxResume credentials not configured.",
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

async function validateRxresume(
  email?: string | null,
  password?: string | null,
): Promise<ValidationResponse> {
  const rxEmail = email?.trim() || process.env.RXRESUME_EMAIL || "";
  const rxPassword = password?.trim() || process.env.RXRESUME_PASSWORD || "";
  const rxUrl = process.env.RXRESUME_URL || "https://v4.rxresu.me";

  if (!rxEmail || !rxPassword) {
    return { valid: false, message: "RxResume credentials are missing." };
  }

  const result = await RxResumeClient.verifyCredentials(
    rxEmail,
    rxPassword,
    rxUrl,
  );

  if (result.ok) {
    return { valid: true, message: null };
  }

  const normalizedMessage = result.message?.toLowerCase() ?? "";
  if (
    result.status === 401 ||
    normalizedMessage.includes("invalidcredentials")
  ) {
    return {
      valid: false,
      message:
        "Invalid RxResume credentials. Check your email and password and try again.",
    };
  }

  const message =
    result.message || `RxResume validation failed (HTTP ${result.status})`;
  return { valid: false, message };
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
    const result = await validateRxresume(email, password);
    res.json({ success: true, data: result });
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
    res.json({ success: true, data: result });
  },
);
