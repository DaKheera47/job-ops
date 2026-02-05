export type LlmProvider =
  | "openrouter"
  | "lmstudio"
  | "ollama"
  | "openai"
  | "gemini";

export type ResponseMode = "json_schema" | "json_object" | "text" | "none";

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

export type LlmServiceOptions = {
  provider?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
};

export type ProviderStrategy = {
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

export interface LlmApiError extends Error {
  status?: number;
  body?: string;
}
