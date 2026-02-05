/**
 * Compatibility facade for legacy imports.
 * New implementation lives under ./llm/*
 */

export { LlmService } from "./llm/service";
export type {
  JsonSchemaDefinition,
  LlmProvider,
  LlmRequestOptions,
  LlmResponse,
  LlmValidationResult,
} from "./llm/types";
export { parseJsonContent } from "./llm/utils/json";
