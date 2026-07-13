import { unprocessableEntity } from "@infra/errors";
import { logger } from "@infra/logger";
import { getRequestId } from "@infra/request-context";
import { getJobOpsAppStatus } from "@server/config/app-mode";
import { isDemoMode } from "@server/config/demo";
import { getSetting } from "@server/repositories/settings";
import { enqueueAutoPdfRegenerationForSettingsChanges } from "@server/services/auto-pdf-regeneration";
import { getDesignResumeStatus } from "@server/services/design-resume";
import { getOriginalEnvValue } from "@server/services/envSettings";
import { resolveLlmApiKey } from "@server/services/llm/credentials";
import { LlmService } from "@server/services/llm/service";
import { clearProfileCache } from "@server/services/profile";
import {
  clearRxResumeResumeCache,
  getResume,
  RxResumeAuthConfigError,
  validateResumeSchema,
  validateCredentials as validateRxResumeCredentials,
} from "@server/services/rxresume";
import { getConfiguredRxResumeBaseResumeId } from "@server/services/rxresume/baseResumeId";
import { applySettingsUpdates } from "@server/services/settings-update";
import { mapGlmProviderAlias } from "@shared/settings-registry";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import type {
  LlmProviderId,
  OnboardingRequirement,
  OnboardingRequirementPrimaryAction,
  OnboardingRequirementStatus,
  OnboardingStatusResponse,
} from "@shared/types";
import { LLM_PROVIDER_VALUES } from "@shared/types";

export type ValidationResponse = {
  valid: boolean;
  message: string | null;
  status?: number | null;
};

export type OnboardingModelActionInput = {
  provider?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
};

export type OnboardingProfileActionInput = {
  country?: string | null;
  cities: string[];
  workplaceTypes: Array<"remote" | "hybrid" | "onsite">;
  requiresVisaSponsorship: boolean;
};

export type OnboardingResumeConfirmActionInput = {
  source: string;
};

export type OnboardingRxResumeActionInput = {
  apiKey?: string | null;
  baseUrl?: string | null;
  rxresumeBaseResumeId?: string | null;
  hasRxresumeBaseResumeId: boolean;
};

function getDefaultValidationBaseUrl(
  provider: string | undefined,
): string | undefined {
  if (provider === "lmstudio") return "http://localhost:1234";
  if (provider === "ollama") return "http://localhost:11434";
  if (provider === "openai_compatible") return "https://api.openai.com";
  if (provider === "glm") return "https://api.z.ai/api/paas/v4";
  return undefined;
}

export function normalizeLlmProviderValue(
  provider: string | null | undefined,
): LlmProviderId | undefined {
  if (!provider) return undefined;
  const normalized = provider.trim().toLowerCase().replace(/[-.]/g, "_");
  const mapped = mapGlmProviderAlias(normalized);
  if (mapped === "claude") return "anthropic";
  return (LLM_PROVIDER_VALUES as readonly string[]).includes(mapped)
    ? (mapped as LlmProviderId)
    : undefined;
}

export async function validateLlm(options: {
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
    normalizedProvider === "glm" ||
    normalizedProvider === "openai_compatible";
  const hasExplicitBaseUrlOverride =
    options.baseUrl !== undefined && options.baseUrl !== null;
  const resolvedBaseUrl = shouldUseBaseUrl
    ? hasExplicitBaseUrlOverride
      ? options.baseUrl?.trim() ||
        getOriginalEnvValue("LLM_BASE_URL")?.trim() ||
        getDefaultValidationBaseUrl(normalizedProvider)
      : storedBaseUrl?.trim() ||
        getOriginalEnvValue("LLM_BASE_URL")?.trim() ||
        undefined
    : undefined;
  const resolvedApiKey = resolveLlmApiKey({
    storedApiKey: options.apiKey ?? storedApiKey,
    provider: normalizedProvider,
  });

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

export async function validateResumeConfig(): Promise<ValidationResponse> {
  try {
    const localStatus = await getDesignResumeStatus();
    if (localStatus.exists) {
      return { valid: true, message: null };
    }

    const { resumeId: rxresumeBaseResumeId } =
      await getConfiguredRxResumeBaseResumeId();

    if (!rxresumeBaseResumeId) {
      return {
        valid: false,
        message:
          "No local resume is ready yet. Upload a PDF, DOCX, or Reactive Resume JSON, or connect Reactive Resume and select a template resume.",
      };
    }

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

export async function validateRxresume(options?: {
  apiKey?: string | null;
  baseUrl?: string | null;
}): Promise<ValidationResponse> {
  const requestApiKey = options?.apiKey?.trim() ?? "";
  const hasExplicitV5Input = options?.apiKey !== undefined;

  const storedBaseUrl = await getSetting("rxresumeUrl");
  const resolvedBaseUrl =
    options?.baseUrl !== undefined && options?.baseUrl !== null
      ? options.baseUrl.trim() ||
        getOriginalEnvValue("RXRESUME_URL")?.trim() ||
        "https://rxresu.me"
      : storedBaseUrl?.trim() ||
        getOriginalEnvValue("RXRESUME_URL")?.trim() ||
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

function isUnavailable(validation: ValidationResponse): boolean {
  if (validation.status === 0 || (validation.status ?? 0) >= 500) return true;
  const message = validation.message?.toLowerCase() ?? "";
  return [
    "fetch failed",
    "network",
    "timeout",
    "timed out",
    "econnrefused",
    "unavailable",
    "failed to fetch",
  ].some((needle) => message.includes(needle));
}

function classifyValidation(
  validation: ValidationResponse,
): OnboardingRequirementStatus {
  if (validation.valid) return "ready";
  if (isUnavailable(validation)) return "checking_unavailable";
  const message = validation.message?.toLowerCase() ?? "";
  if (
    validation.status === 400 ||
    message.includes("missing") ||
    message.includes("not configured") ||
    message.includes("no local resume") ||
    message.includes("select a template")
  ) {
    return "needs_action";
  }
  return "invalid";
}

function getModelValidationMessage(args: {
  validation: ValidationResponse;
  provider: LlmProviderId | undefined;
  providerLabel: string;
}): string {
  const baseMessage =
    args.validation.message ||
    `Job Ops could not verify ${args.providerLabel}. Check the connection and try again.`;

  if (args.provider === "ollama" && isUnavailable(args.validation)) {
    return `${baseMessage} Local Ollama models can be slow or unavailable on smaller hardware. Try a smaller or faster model, make sure Ollama is reachable from the Job Ops container, add more CPU/GPU/RAM, or switch provider from the model step.`;
  }

  return baseMessage;
}

function buildRequirement(args: {
  id: OnboardingRequirement["id"];
  status: OnboardingRequirementStatus;
  title: string;
  message: string;
  primaryAction: OnboardingRequirementPrimaryAction;
  details?: Record<string, unknown>;
}): OnboardingRequirement {
  return {
    id: args.id,
    status: args.status,
    title: args.title,
    message: args.message,
    primaryAction: args.primaryAction,
    ...(args.details ? { details: args.details } : {}),
  };
}

async function buildModelRequirement(): Promise<OnboardingRequirement> {
  const [provider, baseUrl, model, completed] = await Promise.all([
    getSetting("llmProvider"),
    getSetting("llmBaseUrl"),
    getSetting("model"),
    getSetting("onboardingLlmCompleted"),
  ]);
  const normalizedProvider = normalizeLlmProviderValue(provider);
  const providerLabel = normalizedProvider ?? "selected provider";

  if (completed === "1") {
    if (normalizedProvider === "ollama" && !model?.trim()) {
      return buildRequirement({
        id: "model",
        status: "needs_action",
        title: "Choose an Ollama model",
        message:
          "Ollama is connected. Choose one of the models installed in Ollama before continuing.",
        primaryAction: "connect_model",
        details: {
          provider: normalizedProvider,
          baseUrl: baseUrl?.trim() || null,
        },
      });
    }

    return buildRequirement({
      id: "model",
      status: "ready",
      title: "Model connected",
      message:
        "The LLM is ready to power scoring, tailoring, ghostwriting, and email classification.",
      primaryAction: "none",
      details: {
        provider: normalizedProvider ?? null,
        baseUrl: baseUrl?.trim() || null,
      },
    });
  }
  return buildRequirement({
    id: "model",
    status: "needs_action",
    title: "Connect your AI provider",
    message: `Choose and verify ${providerLabel}. The connection is saved only after the server confirms it can be used.`,
    primaryAction: "connect_model",
    details: {
      provider: normalizedProvider ?? null,
      baseUrl: baseUrl?.trim() || null,
    },
  });
}

async function buildResumeRequirement(): Promise<OnboardingRequirement> {
  const [localStatus, confirmedSource] = await Promise.all([
    getDesignResumeStatus(),
    getSetting("onboardingResumeConfirmedSource"),
  ]);
  if (localStatus.exists) {
    const source = `local:${localStatus.documentId}`;
    return buildRequirement({
      id: "resume",
      status: confirmedSource === source ? "ready" : "needs_action",
      title:
        confirmedSource === source ? "Resume confirmed" : "Review your resume",
      message:
        confirmedSource === source
          ? "You confirmed the resume Job Ops should use for matching and applications."
          : "Check the parsed resume, then confirm that Job Ops loaded the correct document.",
      primaryAction: confirmedSource === source ? "none" : "confirm_resume",
      details: {
        source: "local",
        confirmationSource: source,
        documentId: localStatus.documentId ?? null,
        updatedAt: localStatus.updatedAt ?? null,
      },
    });
  }

  const { resumeId } = await getConfiguredRxResumeBaseResumeId();
  if (!resumeId) {
    const rxresumeValidation = await validateRxresume();
    if (rxresumeValidation.valid) {
      return buildRequirement({
        id: "resume",
        status: "needs_action",
        title: "Choose a Reactive Resume template",
        message:
          "Reactive Resume is connected. Select the resume Job Ops should use for matching, fit assessment, and applications.",
        primaryAction: "select_rxresume_template",
        details: { source: "rxresume" },
      });
    }

    return buildRequirement({
      id: "resume",
      status: "needs_action",
      title: "Load your resume",
      message:
        "Upload a resume file, or connect Reactive Resume and choose a template. This gives Job Ops the baseline it needs for matching, fit assessment, and better application workflows.",
      primaryAction: "upload_resume",
      details: {
        source: "none",
        rxresumeStatus: classifyValidation(rxresumeValidation),
      },
    });
  }

  const validation = await validateResumeConfig();
  if (validation.valid) {
    const source = `rxresume:${resumeId}`;
    return buildRequirement({
      id: "resume",
      status: confirmedSource === source ? "ready" : "needs_action",
      title:
        confirmedSource === source ? "Resume confirmed" : "Review your resume",
      message:
        confirmedSource === source
          ? "You confirmed the Reactive Resume template Job Ops should use."
          : "Check the selected Reactive Resume document, then confirm it before continuing.",
      primaryAction: confirmedSource === source ? "none" : "confirm_resume",
      details: {
        source: "rxresume",
        resumeId,
        confirmationSource: source,
      },
    });
  }

  const status = classifyValidation(validation);
  const authIssue =
    validation.message?.toLowerCase().includes("api key") ||
    validation.message?.toLowerCase().includes("auth");
  return buildRequirement({
    id: "resume",
    status,
    title:
      status === "checking_unavailable"
        ? "Resume check is unavailable"
        : "Resume source needs attention",
    message:
      validation.message ||
      "Job Ops could not verify the selected resume. Recheck the source or choose another template.",
    primaryAction:
      status === "checking_unavailable"
        ? "recheck"
        : authIssue
          ? "connect_rxresume"
          : "select_rxresume_template",
    details: { source: "rxresume", resumeId },
  });
}

async function buildHostedResumeRequirement(): Promise<OnboardingRequirement> {
  const localStatus = await getDesignResumeStatus();
  if (localStatus.exists) {
    return buildRequirement({
      id: "resume",
      status: "ready",
      title: "Resume loaded",
      message:
        "Your resume is ready to drive job matching, fit assessment, search terms, and application workflows.",
      primaryAction: "none",
      details: {
        source: "local",
        documentId: localStatus.documentId ?? null,
        updatedAt: localStatus.updatedAt ?? null,
      },
    });
  }

  return buildRequirement({
    id: "resume",
    status: "needs_action",
    title: "Upload your existing resume, PDF or DOCX",
    message:
      "Upload your existing resume as a PDF or DOCX. Job Ops will use it as the baseline for matching, fit assessment, search terms, and application workflows.",
    primaryAction: "upload_resume",
    details: { source: "upload" },
  });
}

export async function getOnboardingStatus(): Promise<OnboardingStatusResponse> {
  const appStatus = getJobOpsAppStatus();
  const userEditableLlmSettings =
    appStatus.capabilities.userEditableLlmSettings;
  const hostedMode = appStatus.appMode === "hosted";

  if (isDemoMode()) {
    const requirements: OnboardingRequirement[] = [
      buildRequirement({
        id: "profile",
        status: "ready",
        title: "Search preferences saved",
        message: "Demo mode includes search preferences.",
        primaryAction: "none",
      }),
      ...(userEditableLlmSettings
        ? [
            buildRequirement({
              id: "model",
              status: "ready",
              title: "Model connected",
              message: "Demo mode simulates the model connection.",
              primaryAction: "none",
            }),
          ]
        : []),
      buildRequirement({
        id: "resume",
        status: "ready",
        title: "Resume loaded",
        message: "Demo mode includes a ready resume.",
        primaryAction: "none",
      }),
    ];
    return { complete: true, nextRequirementId: null, requirements };
  }

  const profileCompleted = await getSetting("onboardingProfileCompleted");
  const profileRequirement = buildRequirement({
    id: "profile",
    status: profileCompleted === "1" ? "ready" : "needs_action",
    title:
      profileCompleted === "1"
        ? "Search preferences saved"
        : "Tell us where you want to work",
    message:
      profileCompleted === "1"
        ? "Your location and workplace preferences will seed future runs."
        : "Add your preferred locations and workplace style so Job Ops can prepare sensible run defaults and sponsor-focused sources.",
    primaryAction: profileCompleted === "1" ? "none" : "save_profile",
  });
  const requirements = userEditableLlmSettings
    ? [
        profileRequirement,
        await buildModelRequirement(),
        hostedMode
          ? await buildHostedResumeRequirement()
          : await buildResumeRequirement(),
      ]
    : [
        profileRequirement,
        hostedMode
          ? await buildHostedResumeRequirement()
          : await buildResumeRequirement(),
      ];
  const nextRequirement = requirements.find(
    (requirement) => requirement.status !== "ready",
  );

  return {
    complete: !nextRequirement,
    nextRequirementId: nextRequirement?.id ?? null,
    requirements,
  };
}

async function persistOnboardingSettings(
  input: UpdateSettingsInput,
  route: string,
): Promise<void> {
  const plan = await applySettingsUpdates(input);
  if (plan.shouldClearRxResumeCaches) {
    clearRxResumeResumeCache();
    clearProfileCache();
  }

  queueMicrotask(() => {
    void enqueueAutoPdfRegenerationForSettingsChanges({
      updatedSettingKeys: plan.updatedSettingKeys,
      requestedBy: "user",
    }).catch((error) => {
      logger.warn("Failed to queue auto PDF regeneration for onboarding", {
        route,
        updatedSettingKeys: plan.updatedSettingKeys,
        error,
      });
    });
  });
}

export async function saveOnboardingModelAction(
  input: OnboardingModelActionInput,
): Promise<OnboardingStatusResponse> {
  const provider = normalizeLlmProviderValue(input.provider);
  const [storedProvider, storedModel] = await Promise.all([
    getSetting("llmProvider"),
    getSetting("model"),
  ]);
  const storedNormalizedProvider = normalizeLlmProviderValue(storedProvider);
  const hasInputModel = Boolean(input.model?.trim());
  const hasSavedOllamaModel =
    provider === "ollama" &&
    storedNormalizedProvider === "ollama" &&
    Boolean(storedModel?.trim());

  if (provider === "ollama" && !hasInputModel && !hasSavedOllamaModel) {
    throw unprocessableEntity(
      "Choose an Ollama model before continuing. If no models appear, pull a model in Ollama and try again.",
      {
        provider,
        status: null,
      },
    );
  }

  const validation = await validateLlm({
    provider,
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
  });
  const route = "POST /api/onboarding/actions/model";

  logger.info("Onboarding model validation completed", {
    requestId: getRequestId() ?? null,
    route,
    provider: provider ?? null,
    validationStatus: validation.valid ? "valid" : "invalid",
  });

  if (!validation.valid) {
    throw unprocessableEntity(
      getModelValidationMessage({
        validation,
        provider,
        providerLabel: provider ?? "selected provider",
      }),
      {
        provider: provider ?? null,
        status: validation.status ?? null,
      },
    );
  }

  const update: UpdateSettingsInput = {};
  if (provider) update.llmProvider = provider;
  if (input.baseUrl !== undefined) update.llmBaseUrl = input.baseUrl ?? "";
  if (input.apiKey?.trim()) update.llmApiKey = input.apiKey.trim();
  if (input.model?.trim()) update.model = input.model.trim();
  update.onboardingLlmCompleted = true;

  await persistOnboardingSettings(update, route);
  return getOnboardingStatus();
}

export async function saveOnboardingProfileAction(
  input: OnboardingProfileActionInput,
): Promise<OnboardingStatusResponse> {
  const route = "POST /api/onboarding/actions/profile";
  await persistOnboardingSettings(
    {
      searchCities: input.cities.join("|"),
      workplaceTypes: input.workplaceTypes,
      jobspyCountryIndeed: input.country?.trim() || null,
      showSponsorInfo: input.requiresVisaSponsorship,
      onboardingProfileCompleted: true,
    },
    route,
  );
  return getOnboardingStatus();
}

export async function confirmOnboardingResumeAction(
  input: OnboardingResumeConfirmActionInput,
): Promise<OnboardingStatusResponse> {
  const localStatus = await getDesignResumeStatus();
  const { resumeId } = await getConfiguredRxResumeBaseResumeId();
  const validSources = new Set<string>();
  if (localStatus.exists && localStatus.documentId) {
    validSources.add(`local:${localStatus.documentId}`);
  }
  if (resumeId && (await validateResumeConfig()).valid) {
    validSources.add(`rxresume:${resumeId}`);
  }
  if (!validSources.has(input.source)) {
    throw unprocessableEntity(
      "The selected resume changed before it could be confirmed. Review the current resume and try again.",
      { source: input.source },
    );
  }
  await persistOnboardingSettings(
    { onboardingResumeConfirmedSource: input.source },
    "POST /api/onboarding/actions/resume/confirm",
  );
  return getOnboardingStatus();
}

export async function saveOnboardingRxResumeAction(
  input: OnboardingRxResumeActionInput,
): Promise<OnboardingStatusResponse> {
  const route = "POST /api/onboarding/actions/rxresume";
  const draftApiKey = input.apiKey?.trim() || undefined;
  const hasCredentialInput =
    draftApiKey !== undefined || input.baseUrl !== undefined;
  const validation = await validateRxresume(
    hasCredentialInput
      ? { apiKey: draftApiKey, baseUrl: input.baseUrl }
      : undefined,
  );

  if (!validation.valid && hasCredentialInput) {
    throw unprocessableEntity(
      validation.message || "Reactive Resume could not be verified.",
      { status: validation.status ?? null },
    );
  }

  const update: UpdateSettingsInput = {
    pdfRenderer: "rxresume",
  };
  if (input.baseUrl !== undefined) update.rxresumeUrl = input.baseUrl ?? null;
  if (draftApiKey) update.rxresumeApiKey = draftApiKey;
  if (input.hasRxresumeBaseResumeId) {
    update.rxresumeBaseResumeId = input.rxresumeBaseResumeId?.trim() || null;
  }

  await persistOnboardingSettings(update, route);
  await validateResumeConfig();
  return getOnboardingStatus();
}
