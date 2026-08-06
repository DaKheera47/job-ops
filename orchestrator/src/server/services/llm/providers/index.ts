import type { LlmProvider, ProviderStrategy } from "../types";
import { anthropicStrategy } from "./anthropic";
import { claudeCliStrategy } from "./claude_cli";
import { codexStrategy } from "./codex";
import { geminiStrategy } from "./gemini";
import { geminiCliStrategy } from "./gemini_cli";
import { glmStrategy } from "./glm";
import { lmStudioStrategy } from "./lmstudio";
import { ollamaStrategy } from "./ollama";
import { openAiStrategy } from "./openai";
import { openAiCompatibleStrategy } from "./openai-compatible";
import { openRouterStrategy } from "./openrouter";
import { orcaRouterStrategy } from "./orcarouter";
import { requestyStrategy } from "./requesty";

export const strategies: Record<LlmProvider, ProviderStrategy> = {
  openrouter: openRouterStrategy,
  orcarouter: orcaRouterStrategy,
  requesty: requestyStrategy,
  lmstudio: lmStudioStrategy,
  ollama: ollamaStrategy,
  openai: openAiStrategy,
  anthropic: anthropicStrategy,
  openai_compatible: openAiCompatibleStrategy,
  glm: glmStrategy,
  gemini: geminiStrategy,
  gemini_cli: geminiCliStrategy,
  claude_cli: claudeCliStrategy,
  codex: codexStrategy,
};
