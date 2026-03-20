import { logger } from "@infra/logger";
import { toStringOrNull } from "@shared/utils/type-conversion";
import {
  buildModeCacheKey,
  getOrderedModes,
  rememberSuccessfulMode,
} from "./policies/mode-selection";
import { getRetryDelayMs, shouldRetryAttempt } from "./policies/retry-policy";
import { strategies } from "./providers";
import type {
  JsonSchemaDefinition,
  LlmApiError,
  LlmProvider,
  LlmRequestOptions,
  LlmResponse,
  LlmServiceOptions,
  LlmValidationResult,
  ResponseMode,
} from "./types";
import {
  addQueryParam,
  buildHeaders,
  getResponseDetail,
  joinUrl,
} from "./utils/http";
import { parseJsonContent } from "./utils/json";
import { parseErrorMessage, truncate } from "./utils/string";

export class LlmService {
  private readonly provider: LlmProvider;
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly strategy: (typeof strategies)[LlmProvider];

  constructor(options: LlmServiceOptions = {}) {
    const normalizedBaseUrl =
      toStringOrNull(options.baseUrl) ||
      toStringOrNull(process.env.LLM_BASE_URL) ||
      null;
    const resolvedProvider = normalizeProvider(
      options.provider ?? process.env.LLM_PROVIDER ?? null,
      normalizedBaseUrl,
    );

    const strategy = strategies[resolvedProvider];
    const baseUrl = normalizedBaseUrl || strategy.defaultBaseUrl;

    let apiKey =
      toStringOrNull(options.apiKey) ||
      toStringOrNull(process.env.LLM_API_KEY) ||
      null;

    // Backwards-compat migration: OPENROUTER_API_KEY -> LLM_API_KEY.
    // This prevents users from losing access when upgrading (keys are often only shown once).
    if (
      !apiKey &&
      resolvedProvider === "openrouter" &&
      toStringOrNull(process.env.OPENROUTER_API_KEY)
    ) {
      logger.warn(
        "[DEPRECATED] OPENROUTER_API_KEY is deprecated. Copying to LLM_API_KEY; please update your environment.",
      );
      const migrated = toStringOrNull(process.env.OPENROUTER_API_KEY);
      if (migrated) {
        process.env.LLM_API_KEY = migrated;
        apiKey = migrated;
      }
    }

    this.provider = resolvedProvider;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.strategy = strategy;
  }

  async callJson<T>(options: LlmRequestOptions<T>): Promise<LlmResponse<T>> {
    if (this.strategy.requiresApiKey && !this.apiKey) {
      return { success: false, error: "LLM API key not configured" };
    }

    const {
      model,
      messages,
      jsonSchema,
      maxRetries = 0,
      retryDelayMs = 500,
      signal,
    } = options;
    const jobId = options.jobId;

    const cacheKey = buildModeCacheKey(this.provider, this.baseUrl);
    const modes = getOrderedModes(cacheKey, this.strategy.modes);

    for (const mode of modes) {
      const result = await this.tryMode<T>({
        mode,
        model,
        messages,
        jsonSchema,
        maxRetries,
        retryDelayMs,
        jobId,
        signal,
      });

      if (result.success) {
        rememberSuccessfulMode(cacheKey, mode);
        return result;
      }

      if (!result.success && result.error.startsWith("CAPABILITY:")) {
        continue;
      }

      return result;
    }

    return { success: false, error: "All provider modes failed" };
  }

  getProvider(): LlmProvider {
    return this.provider;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async validateCredentials(): Promise<LlmValidationResult> {
    if (this.strategy.requiresApiKey && !this.apiKey) {
      return { valid: false, message: "LLM API key is missing." };
    }

    const urls = this.strategy.getValidationUrls({
      baseUrl: this.baseUrl,
      apiKey: this.apiKey,
    });
    let lastMessage: string | null = null;

    for (const url of urls) {
      try {
        const validationApiKey =
          this.provider === "gemini" ? null : this.apiKey;
        const response = await fetch(url, {
          method: "GET",
          headers: buildHeaders({
            apiKey: validationApiKey,
            provider: this.provider,
          }),
        });

        if (response.ok) {
          return { valid: true, message: null };
        }

        const detail = await getResponseDetail(response);
        if (response.status === 401 || response.status === 403) {
          return {
            valid: false,
            message: "Invalid LLM API key. Check the key and try again.",
          };
        }
        logger.warn("LLM credential validation request failed", {
          provider: this.provider,
          status: response.status,
          detail: detail || null,
        });

        lastMessage = detail || `LLM provider returned ${response.status}`;
      } catch (error) {
        logger.warn("LLM credential validation request errored", {
          provider: this.provider,
          error: error instanceof Error ? error.message : String(error),
        });
        lastMessage =
          error instanceof Error ? error.message : "LLM validation failed.";
      }
    }

    return {
      valid: false,
      message: lastMessage || "LLM provider validation failed.",
    };
  }

  async listModels(): Promise<string[]> {
    if (this.strategy.requiresApiKey && !this.apiKey) {
      throw new Error("LLM API key is missing.");
    }

    if (
      this.provider !== "openai" &&
      this.provider !== "gemini" &&
      this.provider !== "ollama"
    ) {
      return [];
    }

    const models = await (async () => {
      if (this.provider === "openai") {
        return this.listOpenAiModels();
      }
      if (this.provider === "gemini") {
        return this.listGeminiModels();
      }
      return this.listOllamaModels();
    })();

    return sortModels(models, getPreferredModel(this.provider));
  }

  private async tryMode<T>(args: {
    mode: ResponseMode;
    model: string;
    messages: LlmRequestOptions<T>["messages"];
    jsonSchema: JsonSchemaDefinition;
    maxRetries: number;
    retryDelayMs: number;
    jobId?: string;
    signal?: AbortSignal;
  }): Promise<LlmResponse<T>> {
    const {
      mode,
      model: rawModel,
      messages,
      jsonSchema,
      maxRetries,
      retryDelayMs,
      signal,
    } = args;
    const jobId = args.jobId;
    const model = normalizeModelForProvider(this.provider, rawModel);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          logger.info("LLM retry attempt", {
            jobId: jobId ?? "unknown",
            attempt,
            maxRetries,
          });
          await sleep(getRetryDelayMs(retryDelayMs, attempt));
        }

        const { url, headers, body } = this.strategy.buildRequest({
          mode,
          baseUrl: this.baseUrl,
          apiKey: this.apiKey,
          model,
          messages,
          jsonSchema,
        });

        const response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal,
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "No error body");
          const parsedError = parseErrorMessage(errorBody);
          const detail = parsedError ? ` - ${truncate(parsedError, 400)}` : "";
          const err = new Error(
            `LLM API error: ${response.status}${detail}`,
          ) as LlmApiError;
          err.status = response.status;
          err.body = truncate(errorBody, 600);
          throw err;
        }

        const data = await response.json();
        const content = this.strategy.extractText(data);

        if (!content) {
          throw new Error("No content in response");
        }

        const parsed = parseJsonContent<T>(content, jobId);
        return { success: true, data: parsed };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = (error as LlmApiError).status;
        const body = (error as LlmApiError).body;

        if (
          this.strategy.isCapabilityError({
            mode,
            status,
            body,
          })
        ) {
          return { success: false, error: `CAPABILITY:${message}` };
        }

        if (attempt < maxRetries && shouldRetryAttempt({ message, status })) {
          logger.warn("LLM attempt failed, retrying", {
            jobId: jobId ?? "unknown",
            attempt: attempt + 1,
            maxRetries,
            status: status ?? "no-status",
            message,
          });
          continue;
        }

        return { success: false, error: message };
      }
    }

    return { success: false, error: "All retry attempts failed" };
  }

  private async listOpenAiModels(): Promise<string[]> {
    const response = await fetch(joinUrl(this.baseUrl, "/v1/models"), {
      method: "GET",
      headers: buildHeaders({
        apiKey: this.apiKey,
        provider: this.provider,
      }),
    });

    if (!response.ok) {
      const detail = await getResponseDetail(response);
      throw new Error(detail || `OpenAI returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ id?: string | null }>;
    };
    return (payload.data ?? [])
      .map((entry) => entry.id?.trim() ?? "")
      .filter(isOpenAiTextGenerationModel)
      .filter(Boolean);
  }

  private async listGeminiModels(): Promise<string[]> {
    const url = addQueryParam(
      joinUrl(this.baseUrl, "/v1beta/models"),
      "key",
      this.apiKey ?? "",
    );
    const response = await fetch(url, {
      method: "GET",
      headers: buildHeaders({
        apiKey: null,
        provider: this.provider,
      }),
    });

    if (!response.ok) {
      const detail = await getResponseDetail(response);
      throw new Error(detail || `Gemini returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      models?: Array<{
        name?: string | null;
        supportedGenerationMethods?: string[] | null;
      }>;
    };
    return (payload.models ?? [])
      .filter((entry) =>
        entry.supportedGenerationMethods?.includes("generateContent"),
      )
      .map((entry) => {
        const normalized = normalizeGeminiModelName(entry.name ?? "");
        return normalized ? `google/${normalized}` : "";
      })
      .filter(isGeminiTextGenerationModel)
      .filter(Boolean);
  }

  private async listOllamaModels(): Promise<string[]> {
    const response = await fetch(joinUrl(this.baseUrl, "/api/tags"), {
      method: "GET",
      headers: buildHeaders({
        apiKey: null,
        provider: this.provider,
      }),
    });

    if (!response.ok) {
      const detail = await getResponseDetail(response);
      throw new Error(detail || `Ollama returned ${response.status}.`);
    }

    const payload = (await response.json()) as {
      models?: Array<{ name?: string | null; model?: string | null }>;
    };
    return (payload.models ?? [])
      .map((entry) => entry.name?.trim() || entry.model?.trim() || "")
      .filter(Boolean);
  }
}

function normalizeProvider(
  raw: string | null,
  baseUrl: string | null,
): LlmProvider {
  const normalized = raw?.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "openai_compatible") {
    if (
      baseUrl?.includes("localhost:1234") ||
      baseUrl?.includes("127.0.0.1:1234")
    ) {
      return "lmstudio";
    }
    return "openai_compatible";
  }
  if (normalized === "openai") return "openai";
  if (normalized === "gemini") return "gemini";
  if (normalized === "lmstudio") return "lmstudio";
  if (normalized === "ollama") return "ollama";
  if (normalized && normalized !== "openrouter") {
    logger.warn("Unknown LLM provider, defaulting to openrouter", {
      normalized,
    });
  }
  return "openrouter";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeModelForProvider(
  provider: LlmProvider,
  model: string,
): string {
  if (provider !== "gemini") return model;
  return normalizeGeminiModelName(model) || model;
}

function normalizeGeminiModelName(value: string): string {
  return value
    .trim()
    .replace(/^models\//, "")
    .replace(/^google\//, "");
}

function getPreferredModel(provider: LlmProvider): string | null {
  if (provider === "openai") return "gpt-5.4-mini";
  if (provider === "gemini") return "google/gemini-3-flash-preview";
  return null;
}

function isOpenAiTextGenerationModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;

  const blockedPatterns = [
    "audio",
    "embedding",
    "image",
    "moderation",
    "realtime",
    "search",
    "similarity",
    "transcribe",
    "transcription",
    "tts",
    "vision",
    "whisper",
    "computer-use",
    "dall-e",
    "babbage",
    "davinci",
    "omni-moderation",
  ];
  if (blockedPatterns.some((pattern) => normalized.includes(pattern))) {
    return false;
  }

  return /^(gpt|o1|o3|o4|chatgpt|codex)/.test(normalized);
}

function isGeminiTextGenerationModel(model: string): boolean {
  const normalized = normalizeGeminiModelName(model).toLowerCase();
  if (!normalized) return false;
  if (!normalized.startsWith("gemini")) return false;

  const blockedPatterns = ["embedding", "aqa", "vision", "image", "tts"];
  return !blockedPatterns.some((pattern) => normalized.includes(pattern));
}

function sortModels(models: string[], preferredModel: string | null): string[] {
  const unique = Array.from(
    new Set(models.map((model) => model.trim())),
  ).filter(Boolean);
  unique.sort((left, right) => left.localeCompare(right));
  if (!preferredModel) return unique;

  const preferredIndex = unique.indexOf(preferredModel);
  if (preferredIndex <= 0) return unique;

  const [preferred] = unique.splice(preferredIndex, 1);
  return [preferred, ...unique];
}
