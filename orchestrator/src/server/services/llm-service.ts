/**
 * LLM service for OpenAI-compatible providers.
 */

export type LlmProvider = "openrouter" | "openai_compatible" | "ollama";

export interface JsonSchemaDefinition {
  name: string;
  schema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  };
}

export interface LlmRequestOptions<_T> {
  /** The model to use (e.g., 'google/gemini-3-flash-preview') */
  model: string;
  /** The prompt messages to send */
  messages: Array<{ role: "user" | "system" | "assistant"; content: string }>;
  /** JSON schema for structured output */
  jsonSchema: JsonSchemaDefinition;
  /** Number of retries on parsing failures (default: 0) */
  maxRetries?: number;
  /** Delay between retries in ms (default: 500) */
  retryDelayMs?: number;
  /** Job ID for logging purposes */
  jobId?: string;
}

export interface LlmResult<T> {
  success: true;
  data: T;
}

export interface LlmError {
  success: false;
  error: string;
}

export type LlmResponse<T> = LlmResult<T> | LlmError;

export type LlmValidationResult = {
  valid: boolean;
  message: string | null;
};

type LlmServiceOptions = {
  provider?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
};

type ProviderConfig = {
  provider: LlmProvider;
  defaultBaseUrl: string;
  chatPath: string;
  validationPaths: string[];
  requiresApiKey: boolean;
  responseFormat: "json_schema" | "json_object" | "none";
};

interface LlmApiError extends Error {
  status?: number;
  body?: string;
}

const providerConfig: Record<LlmProvider, ProviderConfig> = {
  openrouter: {
    provider: "openrouter",
    defaultBaseUrl: "https://openrouter.ai",
    chatPath: "/api/v1/chat/completions",
    validationPaths: ["/api/v1/key"],
    requiresApiKey: true,
    responseFormat: "json_schema",
  },
  openai_compatible: {
    provider: "openai_compatible",
    defaultBaseUrl: "https://api.openai.com",
    chatPath: "/v1/chat/completions",
    validationPaths: ["/v1/models"],
    requiresApiKey: false,
    responseFormat: "none",
  },
  ollama: {
    provider: "ollama",
    defaultBaseUrl: "http://localhost:11434",
    chatPath: "/v1/chat/completions",
    validationPaths: ["/v1/models", "/api/tags"],
    requiresApiKey: false,
    responseFormat: "none",
  },
};

export class LlmService {
  private readonly provider: LlmProvider;
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly config: ProviderConfig;

  constructor(options: LlmServiceOptions = {}) {
    const resolvedProvider = normalizeProvider(
      options.provider ?? process.env.LLM_PROVIDER ?? null,
    );

    const config = providerConfig[resolvedProvider];
    const baseUrl =
      normalizeEnvInput(options.baseUrl) ||
      normalizeEnvInput(process.env.LLM_BASE_URL) ||
      config.defaultBaseUrl;

    const apiKey =
      normalizeEnvInput(options.apiKey) ||
      normalizeEnvInput(process.env.LLM_API_KEY) ||
      (resolvedProvider === "openrouter"
        ? normalizeEnvInput(process.env.OPENROUTER_API_KEY)
        : null);

    this.provider = resolvedProvider;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.config = config;
  }

  async callJson<T>(options: LlmRequestOptions<T>): Promise<LlmResponse<T>> {
    if (this.config.requiresApiKey && !this.apiKey) {
      return { success: false, error: "LLM API key not configured" };
    }

    const {
      model,
      messages,
      jsonSchema,
      maxRetries = 0,
      retryDelayMs = 500,
      jobId,
    } = options;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(
            `🔄 [${jobId ?? "unknown"}] Retry attempt ${attempt}/${maxRetries}...`,
          );
          await sleep(retryDelayMs * attempt);
        }

        const response = await fetch(this.getChatUrl(), {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify({
            model,
            messages,
            stream: false,
            ...(this.config.responseFormat === "json_schema"
              ? {
                  response_format: {
                    type: "json_schema",
                    json_schema: {
                      name: jsonSchema.name,
                      strict: true,
                      schema: jsonSchema.schema,
                    },
                  },
                }
              : this.config.responseFormat === "json_object"
                ? { response_format: { type: "json_object" } }
                : {}),
            ...(this.provider === "openrouter"
              ? { plugins: [{ id: "response-healing" }] }
              : {}),
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "No error body");
          const detail = errorBody ? ` - ${truncate(errorBody, 400)}` : "";
          const err = new Error(
            `LLM API error: ${response.status}${detail}`,
          ) as LlmApiError;
          err.status = response.status;
          err.body = errorBody;
          throw err;
        }

        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;

        if (!content) {
          throw new Error("No content in response");
        }

        const parsed = parseJsonContent<T>(content, jobId);

        return { success: true, data: parsed };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const status = (error as LlmApiError).status;

        const shouldRetry =
          message.includes("parse") ||
          status === 429 ||
          (status !== undefined && status >= 500 && status <= 599) ||
          message.toLowerCase().includes("timeout") ||
          message.toLowerCase().includes("fetch failed");

        if (attempt < maxRetries && shouldRetry) {
          console.warn(
            `⚠️ [${jobId ?? "unknown"}] Attempt ${attempt + 1} failed (${status ?? "no-status"}): ${message}. Retrying...`,
          );
          continue;
        }

        return { success: false, error: message };
      }
    }

    return { success: false, error: "All retry attempts failed" };
  }

  getProvider(): LlmProvider {
    return this.provider;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async validateCredentials(): Promise<LlmValidationResult> {
    if (this.config.requiresApiKey && !this.apiKey) {
      return { valid: false, message: "LLM API key is missing." };
    }

    const headers = this.getHeaders({ includeAuth: true });
    let lastMessage: string | null = null;

    for (const path of this.config.validationPaths) {
      try {
        const response = await fetch(joinUrl(this.baseUrl, path), {
          method: "GET",
          headers,
        });

        if (response.ok) {
          return { valid: true, message: null };
        }

        const detail = await getResponseDetail(response);

        if (response.status === 401) {
          return {
            valid: false,
            message: "Invalid LLM API key. Check the key and try again.",
          };
        }

        lastMessage = detail || `LLM provider returned ${response.status}`;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "LLM validation failed.";
        lastMessage = message;
      }
    }

    return {
      valid: false,
      message: lastMessage || "LLM provider validation failed.",
    };
  }

  private getChatUrl(): string {
    return joinUrl(this.baseUrl, this.config.chatPath);
  }

  private getHeaders({ includeAuth = true } = {}): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (includeAuth && this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    if (this.provider === "openrouter") {
      headers["HTTP-Referer"] = "JobOps";
      headers["X-Title"] = "JobOpsOrchestrator";
    }

    return headers;
  }
}

export function parseJsonContent<T>(content: string, jobId?: string): T {
  let candidate = content.trim();

  candidate = candidate
    .replace(/```(?:json|JSON)?\s*/g, "")
    .replace(/```/g, "")
    .trim();

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    candidate = candidate.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(candidate) as T;
  } catch (error) {
    console.error(
      `❌ [${jobId ?? "unknown"}] Failed to parse JSON:`,
      candidate.substring(0, 200),
    );
    throw new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
}

function normalizeProvider(raw: string | null): LlmProvider {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "openai" || normalized === "openai_compatible") {
    return "openai_compatible";
  }
  if (normalized === "ollama") return "ollama";
  if (normalized && normalized !== "openrouter") {
    console.warn(
      `⚠️ Unknown LLM provider "${normalized}", defaulting to openrouter`,
    );
  }
  return "openrouter";
}

function normalizeEnvInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function getResponseDetail(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload && typeof payload === "object" && "error" in payload) {
      const errorObj = payload.error as {
        message?: string;
        code?: number | string;
      };
      const message = errorObj?.message || "";
      const code = errorObj?.code ? ` (${errorObj.code})` : "";
      return `${message}${code}`.trim();
    }
  } catch {
    // ignore JSON parse errors
  }

  return response.text().catch(() => "");
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}
