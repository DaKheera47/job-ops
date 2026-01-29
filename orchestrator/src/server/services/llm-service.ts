/**
 * LLM service with provider-specific strategies and strict-first fallback.
 */

export type LlmProvider =
  | "openrouter"
  | "lmstudio"
  | "ollama"
  | "openai"
  | "gemini";

type ResponseMode = "json_schema" | "json_object" | "text" | "none";

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

type ProviderStrategy = {
  provider: LlmProvider;
  defaultBaseUrl: string;
  requiresApiKey: boolean;
  modes: ResponseMode[];
  validationPaths: string[];
  buildRequest: (args: {
    mode: ResponseMode;
    baseUrl: string;
    apiKey: string | null;
    model: string;
    messages: LlmRequestOptions<unknown>["messages"];
    jsonSchema: JsonSchemaDefinition;
  }) => { url: string; headers: Record<string, string>; body: unknown };
  extractText: (response: unknown) => string | null;
  isCapabilityError: (args: {
    mode: ResponseMode;
    status?: number;
    body?: string;
  }) => boolean;
  getValidationUrls: (args: {
    baseUrl: string;
    apiKey: string | null;
  }) => string[];
};

interface LlmApiError extends Error {
  status?: number;
  body?: string;
}

const modeCache = new Map<string, ResponseMode>();

const openRouterStrategy: ProviderStrategy = {
  provider: "openrouter",
  defaultBaseUrl: "https://openrouter.ai",
  requiresApiKey: true,
  modes: ["json_schema", "none"],
  validationPaths: ["/api/v1/key"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      plugins: [{ id: "response-healing" }],
    };

    if (mode === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: jsonSchema.name,
          strict: true,
          schema: jsonSchema.schema,
        },
      };
    }

    return {
      url: joinUrl(baseUrl, "/api/v1/chat/completions"),
      headers: buildHeaders({ apiKey, provider: "openrouter" }),
      body,
    };
  },
  extractText: (response) => {
    const content = getNestedValue(response, [
      "choices",
      0,
      "message",
      "content",
    ]);
    return typeof content === "string" ? content : null;
  },
  isCapabilityError: ({ mode, status, body }) =>
    isCapabilityError({ mode, status, body }),
  getValidationUrls: ({ baseUrl }) => [joinUrl(baseUrl, "/api/v1/key")],
};

const lmStudioStrategy: ProviderStrategy = {
  provider: "lmstudio",
  defaultBaseUrl: "http://localhost:1234",
  requiresApiKey: false,
  modes: ["json_schema", "text", "none"],
  validationPaths: ["/v1/models"],
  buildRequest: ({ mode, baseUrl, model, messages, jsonSchema }) => {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };

    if (mode === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: jsonSchema.name,
          strict: true,
          schema: jsonSchema.schema,
        },
      };
    } else if (mode === "text") {
      body.response_format = { type: "text" };
    }

    return {
      url: joinUrl(baseUrl, "/v1/chat/completions"),
      headers: buildHeaders({ apiKey: null, provider: "lmstudio" }),
      body,
    };
  },
  extractText: (response) => {
    const content = getNestedValue(response, [
      "choices",
      0,
      "message",
      "content",
    ]);
    return typeof content === "string" ? content : null;
  },
  isCapabilityError: ({ mode, status, body }) =>
    isCapabilityError({ mode, status, body }),
  getValidationUrls: ({ baseUrl }) => [joinUrl(baseUrl, "/v1/models")],
};

const ollamaStrategy: ProviderStrategy = {
  provider: "ollama",
  defaultBaseUrl: "http://localhost:11434",
  requiresApiKey: false,
  modes: ["json_schema", "text", "none"],
  validationPaths: ["/v1/models", "/api/tags"],
  buildRequest: ({ mode, baseUrl, model, messages, jsonSchema }) => {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };

    if (mode === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: jsonSchema.name,
          strict: true,
          schema: jsonSchema.schema,
        },
      };
    } else if (mode === "text") {
      body.response_format = { type: "text" };
    }

    return {
      url: joinUrl(baseUrl, "/v1/chat/completions"),
      headers: buildHeaders({ apiKey: null, provider: "ollama" }),
      body,
    };
  },
  extractText: (response) => {
    const content = getNestedValue(response, [
      "choices",
      0,
      "message",
      "content",
    ]);
    return typeof content === "string" ? content : null;
  },
  isCapabilityError: ({ mode, status, body }) =>
    isCapabilityError({ mode, status, body }),
  getValidationUrls: ({ baseUrl }) => [
    joinUrl(baseUrl, "/v1/models"),
    joinUrl(baseUrl, "/api/tags"),
  ],
};

const openAiStrategy: ProviderStrategy = {
  provider: "openai",
  defaultBaseUrl: "https://api.openai.com",
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "none"],
  validationPaths: ["/v1/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    const input = ensureJsonInstructionIfNeeded(messages, mode);
    const body: Record<string, unknown> = {
      model,
      input,
    };

    if (mode === "json_schema") {
      body.text = {
        format: {
          type: "json_schema",
          name: jsonSchema.name,
          strict: true,
          schema: jsonSchema.schema,
        },
      };
    } else if (mode === "json_object") {
      body.text = { format: { type: "json_object" } };
    }

    return {
      url: joinUrl(baseUrl, "/v1/responses"),
      headers: buildHeaders({ apiKey, provider: "openai" }),
      body,
    };
  },
  extractText: (response) => {
    const direct = getNestedValue(response, ["output_text"]);
    if (typeof direct === "string" && direct.trim()) return direct;

    const output = getNestedValue(response, ["output"]);
    if (!Array.isArray(output)) return null;

    for (const item of output) {
      const content = getNestedValue(item, ["content"]);
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        const type = getNestedValue(part, ["type"]);
        const text = getNestedValue(part, ["text"]);
        if (type === "output_text" && typeof text === "string") {
          return text;
        }
      }
    }
    return null;
  },
  isCapabilityError: ({ mode, status, body }) =>
    isCapabilityError({ mode, status, body }),
  getValidationUrls: ({ baseUrl }) => [joinUrl(baseUrl, "/v1/models")],
};

const geminiStrategy: ProviderStrategy = {
  provider: "gemini",
  defaultBaseUrl: "https://generativelanguage.googleapis.com",
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "none"],
  validationPaths: ["/v1beta/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    const { systemInstruction, contents } = toGeminiContents(messages);
    const body: Record<string, unknown> = {
      contents,
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    if (mode === "json_schema") {
      body.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: jsonSchema.schema,
      };
    } else if (mode === "json_object") {
      body.generationConfig = {
        responseMimeType: "application/json",
      };
    }

    const url = joinUrl(
      baseUrl,
      `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    );
    const urlWithKey = addQueryParam(url, "key", apiKey ?? "");

    return {
      url: urlWithKey,
      headers: buildHeaders({ apiKey: null, provider: "gemini" }),
      body,
    };
  },
  extractText: (response) => {
    const parts = getNestedValue(response, [
      "candidates",
      0,
      "content",
      "parts",
    ]);
    if (!Array.isArray(parts)) return null;
    const text = parts
      .map((part) => getNestedValue(part, ["text"]))
      .filter((part) => typeof part === "string")
      .join("");
    return text || null;
  },
  isCapabilityError: ({ mode, status, body }) =>
    isCapabilityError({ mode, status, body }),
  getValidationUrls: ({ baseUrl, apiKey }) => {
    const url = joinUrl(baseUrl, "/v1beta/models");
    return [addQueryParam(url, "key", apiKey ?? "")];
  },
};

const strategies: Record<LlmProvider, ProviderStrategy> = {
  openrouter: openRouterStrategy,
  lmstudio: lmStudioStrategy,
  ollama: ollamaStrategy,
  openai: openAiStrategy,
  gemini: geminiStrategy,
};

export class LlmService {
  private readonly provider: LlmProvider;
  private readonly baseUrl: string;
  private readonly apiKey: string | null;
  private readonly strategy: ProviderStrategy;

  constructor(options: LlmServiceOptions = {}) {
    const normalizedBaseUrl =
      normalizeEnvInput(options.baseUrl) ||
      normalizeEnvInput(process.env.LLM_BASE_URL) ||
      null;
    const resolvedProvider = normalizeProvider(
      options.provider ?? process.env.LLM_PROVIDER ?? null,
      normalizedBaseUrl,
    );

    const strategy = strategies[resolvedProvider];
    const baseUrl = normalizedBaseUrl || strategy.defaultBaseUrl;

    const apiKey =
      normalizeEnvInput(options.apiKey) ||
      normalizeEnvInput(process.env.LLM_API_KEY) ||
      (resolvedProvider === "openrouter"
        ? normalizeEnvInput(process.env.OPENROUTER_API_KEY)
        : null);

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
    } = options;
    const jobId = options.jobId;

    const cacheKey = `${this.provider}:${this.baseUrl}`;
    const cachedMode = modeCache.get(cacheKey);
    const modes = cachedMode
      ? [cachedMode, ...this.strategy.modes.filter((m) => m !== cachedMode)]
      : this.strategy.modes;

    for (const mode of modes) {
      const result = await this.tryMode<T>({
        mode,
        model,
        messages,
        jsonSchema,
        maxRetries,
        retryDelayMs,
        jobId,
      });

      if (result.success) {
        modeCache.set(cacheKey, mode);
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
        const response = await fetch(url, {
          method: "GET",
          headers: buildHeaders({
            apiKey: this.apiKey,
            provider: this.provider,
          }),
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
        lastMessage =
          error instanceof Error ? error.message : "LLM validation failed.";
      }
    }

    return {
      valid: false,
      message: lastMessage || "LLM provider validation failed.",
    };
  }

  private async tryMode<T>(args: {
    mode: ResponseMode;
    model: string;
    messages: LlmRequestOptions<T>["messages"];
    jsonSchema: JsonSchemaDefinition;
    maxRetries: number;
    retryDelayMs: number;
    jobId?: string;
  }): Promise<LlmResponse<T>> {
    const { mode, model, messages, jsonSchema, maxRetries, retryDelayMs } =
      args;
    const jobId = args.jobId;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(
            `🔄 [${jobId ?? "unknown"}] Retry attempt ${attempt}/${maxRetries}...`,
          );
          await sleep(retryDelayMs * attempt);
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
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "No error body");
          const parsedError = parseErrorMessage(errorBody);
          const detail = parsedError ? ` - ${truncate(parsedError, 400)}` : "";
          const err = new Error(
            `LLM API error: ${response.status}${detail}`,
          ) as LlmApiError;
          err.status = response.status;
          err.body = errorBody;
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

function normalizeProvider(
  raw: string | null,
  baseUrl: string | null,
): LlmProvider {
  const normalized = raw?.trim().toLowerCase();
  if (normalized === "openai_compatible") {
    if (
      baseUrl?.includes("localhost:1234") ||
      baseUrl?.includes("127.0.0.1:1234")
    ) {
      return "lmstudio";
    }
    return "openai";
  }
  if (normalized === "openai") return "openai";
  if (normalized === "gemini") return "gemini";
  if (normalized === "lmstudio") return "lmstudio";
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

function buildHeaders(args: {
  apiKey: string | null;
  provider: LlmProvider;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (args.apiKey) {
    headers.Authorization = `Bearer ${args.apiKey}`;
  }

  if (args.provider === "openrouter") {
    headers["HTTP-Referer"] = "JobOps";
    headers["X-Title"] = "JobOpsOrchestrator";
  }

  return headers;
}

function ensureJsonInstructionIfNeeded(
  messages: LlmRequestOptions<unknown>["messages"],
  mode: ResponseMode,
) {
  if (mode !== "json_object") return messages;
  const hasJson = messages.some((message) =>
    message.content.toLowerCase().includes("json"),
  );
  if (hasJson) return messages;
  return [
    {
      role: "system" as const,
      content: "Respond with valid JSON.",
    },
    ...messages,
  ];
}

function toGeminiContents(messages: LlmRequestOptions<unknown>["messages"]): {
  systemInstruction: { parts: Array<{ text: string }> } | null;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
} {
  const systemParts: string[] = [];
  const contents = messages
    .filter((message) => {
      if (message.role === "system") {
        systemParts.push(message.content);
        return false;
      }
      return true;
    })
    .map((message) => {
      const role: "user" | "model" =
        message.role === "assistant" ? "model" : "user";
      return { role, parts: [{ text: message.content }] };
    });

  const systemInstruction = systemParts.length
    ? { parts: [{ text: systemParts.join("\n") }] }
    : null;

  return { systemInstruction, contents };
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

function isCapabilityError(args: {
  mode: ResponseMode;
  status?: number;
  body?: string;
}): boolean {
  if (args.mode === "none") return false;
  if (args.status !== 400) return false;
  const body = (args.body || "").toLowerCase();

  if (body.includes("model") && body.includes("not")) return false;
  if (body.includes("unknown model")) return false;

  return (
    body.includes("response_format") ||
    body.includes("json_schema") ||
    body.includes("json_object") ||
    body.includes("text.format") ||
    body.includes("response schema") ||
    body.includes("responseschema") ||
    body.includes("responsemime") ||
    body.includes("response_mime")
  );
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

function addQueryParam(url: string, key: string, value: string): string {
  const connector = url.includes("?") ? "&" : "?";
  return `${url}${connector}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

type PathSegment = string | number;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNestedValue(value: unknown, path: PathSegment[]): unknown {
  let current: unknown = value;
  for (const segment of path) {
    if (typeof segment === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function parseErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const payload = JSON.parse(trimmed) as unknown;
    const candidates: Array<unknown> = [
      getNestedValue(payload, ["error", "message"]),
      getNestedValue(payload, ["error", "error", "message"]),
      getNestedValue(payload, ["error"]),
      getNestedValue(payload, ["message"]),
      getNestedValue(payload, ["detail"]),
      getNestedValue(payload, ["msg"]),
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    if (typeof payload === "string" && payload.trim()) {
      return payload.trim();
    }
  } catch {
    // Not JSON
  }

  return trimmed;
}
