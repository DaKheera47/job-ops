import * as settingsRepo from "@server/repositories/settings";
import {
  getDefaultPromptTemplate,
  type PromptTemplateSettingKey,
} from "@shared/prompt-template-definitions.js";
import { settingsRegistry } from "@shared/settings-registry";

export type PromptTemplateTokens = Record<
  string,
  string | number | null | undefined
>;

export async function getEffectivePromptTemplate(
  key: PromptTemplateSettingKey,
): Promise<string> {
  const raw = await settingsRepo.getSetting(key);
  const parsed = settingsRegistry[key].parse(raw ?? undefined);
  return parsed ?? getDefaultPromptTemplate(key);
}

export function renderPromptTemplate(
  template: string,
  tokens: PromptTemplateTokens,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9]+)\s*\}\}/g, (match, token) => {
    if (!Object.hasOwn(tokens, token)) {
      return match;
    }

    const value = tokens[token];
    return value === null || value === undefined ? "" : String(value);
  });
}
