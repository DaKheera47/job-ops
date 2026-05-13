import { badRequest, upstreamError } from "@infra/errors";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import type {
  DesignResumeAiFieldSuggestionRequest,
  DesignResumeAiFieldSuggestionResponse,
  DesignResumeAiFieldValueType,
  DesignResumeJson,
} from "@shared/types";
import type { JsonSchemaDefinition } from "../llm/types";
import { createConfiguredLlmService, resolveLlmModel } from "../modelSelection";
import {
  getWritingLanguageLabel,
  resolveWritingOutputLanguage,
} from "../output-language";
import {
  getWritingStyle,
  stripLanguageDirectivesFromConstraints,
} from "../writing-style";

const MAX_PROMPT_CHARS = 3000;
const MAX_FIELD_CHARS = 4000;
const MAX_CONTEXT_CHARS = 9000;
const SAFE_HTML_TAGS = new Set(["p", "ul", "ol", "li", "strong", "em", "br"]);

const FIELD_SUGGESTION_SCHEMA: JsonSchemaDefinition = {
  name: "design_resume_field_suggestion",
  schema: {
    type: "object",
    properties: {
      message: {
        type: "string",
        description: "Brief explanation for the user.",
      },
      suggestion: {
        anyOf: [
          { type: "string" },
          {
            type: "array",
            items: { type: "string" },
          },
        ],
        description: "Replacement field value.",
      },
    },
    required: ["message", "suggestion"],
    additionalProperties: false,
  },
};

function truncate(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizePlainText(value: string): string {
  return value
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeStringList(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/g)
      : [];

  return Array.from(
    new Set(
      source
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .slice(0, 40),
    ),
  );
}

function sanitizeHtml(value: string): string {
  let sanitized = value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?([a-zA-Z0-9-]+)(?:\s[^>]*)?>/g, (match, rawTag) => {
      const tag = String(rawTag).toLowerCase();
      if (!SAFE_HTML_TAGS.has(tag)) return "";
      return match.startsWith("</") ? `</${tag}>` : `<${tag}>`;
    })
    .trim();

  if (!sanitized) return "";
  if (!/<(?:p|ul|ol|li|strong|em|br)>/i.test(sanitized)) {
    sanitized = `<p>${sanitized}</p>`;
  }
  return sanitized;
}

function sanitizeSuggestion(
  value: unknown,
  valueType: DesignResumeAiFieldValueType,
): string | string[] {
  if (valueType === "string_list") return sanitizeStringList(value);
  const text = typeof value === "string" ? value : "";
  if (valueType === "html") return sanitizeHtml(text);
  return sanitizePlainText(stripHtml(text));
}

function compactResumeContext(document: DesignResumeJson): string {
  const basics = asRecord(document.basics) ?? {};
  const summary = asRecord(document.summary) ?? {};
  const sections = asRecord(document.sections) ?? {};

  const sectionItems = Object.entries(sections).map(([key, section]) => {
    const record = asRecord(section) ?? {};
    const items = asArray(record.items)
      .slice(0, 8)
      .map((item) => {
        const itemRecord = asRecord(item) ?? {};
        return {
          name:
            toText(itemRecord.name) ||
            toText(itemRecord.title) ||
            toText(itemRecord.position) ||
            toText(itemRecord.company) ||
            toText(itemRecord.school) ||
            toText(itemRecord.organization),
          position: toText(itemRecord.position),
          company: toText(itemRecord.company),
          description: truncate(stripHtml(toText(itemRecord.description)), 700),
          keywords: asArray(itemRecord.keywords)
            .map((entry) => String(entry))
            .slice(0, 20),
        };
      });
    return [key, items];
  });

  return truncate(
    JSON.stringify(
      {
        basics: {
          name: toText(basics.name),
          headline: toText(basics.headline),
          location: toText(basics.location),
        },
        summary: truncate(stripHtml(toText(summary.content)), 1200),
        sections: Object.fromEntries(sectionItems),
      },
      null,
      2,
    ),
    MAX_CONTEXT_CHARS,
  );
}

async function buildPrompt(
  input: DesignResumeAiFieldSuggestionRequest,
): Promise<string> {
  const writingStyle = await getWritingStyle();
  const resolvedLanguage = resolveWritingOutputLanguage({
    style: writingStyle,
    profile: {},
  });
  const outputLanguage = getWritingLanguageLabel(resolvedLanguage.language);
  const effectiveConstraints = stripLanguageDirectivesFromConstraints(
    writingStyle.constraints,
  );

  return [
    "You are helping edit a reusable baseline resume in Resume Studio.",
    "Return a targeted replacement for only the active field. Do not rewrite unrelated fields.",
    "Keep the user in the loop: include a short message explaining what changed.",
    `Output language: ${outputLanguage}.`,
    `Tone: ${writingStyle.tone}. Formality: ${writingStyle.formality}.`,
    effectiveConstraints ? `Writing constraints: ${effectiveConstraints}.` : "",
    writingStyle.doNotUse ? `Avoid these terms: ${writingStyle.doNotUse}.` : "",
    "",
    `Active field: ${input.field.label}`,
    `Field path: ${input.field.path}`,
    `Field value type: ${input.field.valueType}`,
    input.field.section ? `Section: ${input.field.section}` : "",
    input.field.itemLabel ? `Item: ${input.field.itemLabel}` : "",
    `Current value:\n${truncate(Array.isArray(input.field.value) ? input.field.value.join(", ") : input.field.value, MAX_FIELD_CHARS) || "[empty]"}`,
    "",
    `User request:\n${truncate(input.prompt, MAX_PROMPT_CHARS)}`,
    "",
    `Resume context JSON:\n${compactResumeContext(input.document)}`,
    "",
    input.field.valueType === "html"
      ? "The suggestion must be simple HTML using only p, ul, ol, li, strong, em, and br tags."
      : "",
    input.field.valueType === "string_list"
      ? "The suggestion must be an array of concise strings."
      : "The suggestion must be a string.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateDesignResumeFieldSuggestion(
  input: DesignResumeAiFieldSuggestionRequest,
): Promise<DesignResumeAiFieldSuggestionResponse> {
  if (!input.prompt.trim()) {
    throw badRequest("Prompt is required.");
  }
  if (!input.field.path.trim() || !input.field.label.trim()) {
    throw badRequest("Field path and label are required.");
  }

  const [model, prompt] = await Promise.all([
    resolveLlmModel("tailoring"),
    buildPrompt(input),
  ]);
  const llm = await createConfiguredLlmService("tailoring");
  const result = await llm.callJson<{
    message: string;
    suggestion: string | string[];
  }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: FIELD_SUGGESTION_SCHEMA,
    maxRetries: 1,
    retryDelayMs: 300,
  });

  if (!result.success) {
    logger.warn("Design Resume field AI suggestion failed", {
      fieldPath: input.field.path,
      valueType: input.field.valueType,
      error: sanitizeUnknown(result.error),
    });
    throw upstreamError("AI field suggestion failed", {
      reason: result.error,
    });
  }

  const suggestion = sanitizeSuggestion(
    result.data.suggestion,
    input.field.valueType,
  );
  const message =
    sanitizePlainText(result.data.message || "") ||
    "I drafted a focused replacement for this field.";

  return {
    message,
    suggestion,
    valueType: input.field.valueType,
  };
}
