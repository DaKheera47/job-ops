import {
  AppError,
  badRequest,
  serviceUnavailable,
  upstreamError,
} from "@infra/errors";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { getRequestId } from "@server/infra/request-context";
import { GeminiCliClient } from "@server/services/llm/gemini-cli/client";
import type { JsonSchemaDefinition } from "@server/services/llm/types";
import { resolveLlmRuntimeSettings } from "@server/services/modelSelection";
import { normalizeReactiveResumeV5Document } from "@server/services/rxresume/document";
import {
  getResumeSchemaValidationMessage,
  safeParseV5ResumeData,
} from "@server/services/rxresume/schema";
import type { DesignResumeDocument, DesignResumeJson } from "@shared/types";
import { jsonrepair } from "jsonrepair";
import JSZip from "jszip";
import { buildHeaders, getResponseDetail, joinUrl } from "../llm/utils/http";
import { parseErrorMessage, truncate } from "../llm/utils/string";
import { replaceCurrentDesignResumeDocument } from "./index";

type SupportedImportMediaType =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type SupportedRuntimeProvider =
  | "openai"
  | "openrouter"
  | "gemini"
  | "gemini_cli";

const DESIGN_RESUME_IMPORT_CLI_JSON_SCHEMA: JsonSchemaDefinition = {
  name: "design_resume_import",
  schema: {
    type: "object",
    properties: {
      picture: { type: "object" },
      basics: { type: "object" },
      summary: { type: "object" },
      sections: { type: "object" },
      metadata: { type: "object" },
      customSections: { type: "array" },
    },
    required: [
      "picture",
      "basics",
      "summary",
      "sections",
      "metadata",
      "customSections",
    ],
    additionalProperties: true,
  },
};

type ResumeImportFileInput = {
  fileName: string;
  mediaType?: string | null;
  dataBase64: string;
};

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const OPENAI_DEFAULT_TIMEOUT_MS = 60_000;
const OPENROUTER_DEFAULT_TIMEOUT_MS = 90_000;
const GEMINI_DEFAULT_TIMEOUT_MS = 90_000;
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const SUPPORTED_EXTENSION_TO_MEDIA_TYPE: Record<
  string,
  SupportedImportMediaType
> = {
  pdf: "application/pdf",
  docx: DOCX_MIME,
};

const SYSTEM_PROMPT = `
You extract a resume into a single JSON object.

Rules:
- Extract only information explicitly present in the provided resume input.
- Do not guess, infer, summarize, embellish, or invent missing values.
- Preserve the source language and wording as closely as possible.
- Return JSON only. Do not wrap it in markdown or prose.
- If a field is unknown, use an empty string, empty array, or default placeholder that matches the template.
- For rich text descriptions and summaries, preserve structure using simple HTML tags only: <p>, <ul>, <li>, <strong>, <em>.
- Do not add sections or keys that do not exist in the template.
- Keep dates, names, locations, and organization names exactly as written when possible.
`.trim();

type RecordLike = Record<string, unknown>;

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function trimText(value: unknown): string {
  return toText(value).trim();
}

function normalizeRuntimeProvider(
  provider: string | null,
): SupportedRuntimeProvider | null {
  const normalized = provider?.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "openai") return "openai";
  if (normalized === "openrouter" || normalized === "open_router") {
    return "openrouter";
  }
  if (normalized === "gemini") return "gemini";
  if (normalized === "gemini_cli") return "gemini_cli";
  return null;
}

function normalizeFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    throw badRequest("Resume import requires a file name.");
  }
  if (trimmed.length > 255) {
    throw badRequest("Resume file names must be 255 characters or shorter.");
  }
  return trimmed;
}

function extensionFromFileName(fileName: string): string {
  const match = /\.([^.]+)$/.exec(fileName.toLowerCase());
  return match?.[1] ?? "";
}

function normalizeImportMediaType(input: {
  fileName: string;
  mediaType?: string | null;
}): SupportedImportMediaType {
  const extension = extensionFromFileName(input.fileName);
  const fromExtension = SUPPORTED_EXTENSION_TO_MEDIA_TYPE[extension];
  const normalizedMediaType = input.mediaType?.trim().toLowerCase() ?? "";
  if (normalizedMediaType === "application/pdf") return "application/pdf";
  if (normalizedMediaType === DOCX_MIME) return DOCX_MIME;

  if (
    (!normalizedMediaType ||
      normalizedMediaType === "application/octet-stream") &&
    fromExtension
  ) {
    return fromExtension;
  }

  throw badRequest("Only PDF and DOCX resumes are supported.");
}

function normalizeBase64Payload(dataBase64: string): string {
  const trimmed = dataBase64.trim();
  if (!trimmed) {
    throw badRequest("Resume import requires file data.");
  }

  const normalized = trimmed.replace(/\s+/g, "");
  if (!normalized) {
    throw badRequest("Resume import requires file data.");
  }
  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw badRequest("Resume file data must be valid base64.");
  }

  const paddingLength = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  const estimatedByteLength = (normalized.length / 4) * 3 - paddingLength;
  if (estimatedByteLength > MAX_IMPORT_FILE_BYTES) {
    throw badRequest("Resume files must be 10 MB or smaller.");
  }

  return normalized;
}

function decodeBase64Payload(dataBase64: string): {
  decoded: Buffer;
  normalizedBase64: string;
} {
  const normalized = normalizeBase64Payload(dataBase64);
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.toString("base64") !== normalized) {
    throw badRequest("Resume file data must be valid base64.");
  }

  if (decoded.byteLength === 0) {
    throw badRequest("Resume file data must not be empty.");
  }

  if (decoded.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw badRequest("Resume files must be 10 MB or smaller.");
  }

  return { decoded, normalizedBase64: normalized };
}

function buildDataUrl(
  mediaType: SupportedImportMediaType,
  dataBase64: string,
): string {
  return `data:${mediaType};base64,${dataBase64}`;
}

function buildUserPrompt(): string {
  const template = {
    picture: {
      hidden: false,
      url: "",
      size: 80,
      rotation: 0,
      aspectRatio: 1,
      borderRadius: 0,
      borderColor: "rgba(0, 0, 0, 0.5)",
      borderWidth: 0,
      shadowColor: "rgba(0, 0, 0, 0.5)",
      shadowWidth: 0,
    },
    basics: {
      name: "",
      headline: "",
      email: "",
      phone: "",
      location: "",
      website: { url: "", label: "" },
      customFields: [],
    },
    summary: {
      title: "",
      columns: 1,
      hidden: false,
      content: "",
    },
    sections: {
      profiles: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            icon: "",
            network: "",
            username: "",
            website: { url: "", label: "" },
            options: { showLinkInTitle: false },
          },
        ],
      },
      experience: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            company: "",
            position: "",
            location: "",
            period: "",
            website: { url: "", label: "" },
            description: "",
            roles: [],
            options: { showLinkInTitle: false },
          },
        ],
      },
      education: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            school: "",
            degree: "",
            area: "",
            grade: "",
            location: "",
            period: "",
            website: { url: "", label: "" },
            description: "",
            options: { showLinkInTitle: false },
          },
        ],
      },
      projects: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            name: "",
            period: "",
            website: { url: "", label: "" },
            description: "",
            options: { showLinkInTitle: false },
          },
        ],
      },
      skills: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            icon: "",
            name: "",
            proficiency: "",
            level: 0,
            keywords: [],
          },
        ],
      },
      languages: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            language: "",
            fluency: "",
            level: 0,
          },
        ],
      },
      interests: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            icon: "",
            name: "",
            keywords: [],
          },
        ],
      },
      awards: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            title: "",
            awarder: "",
            date: "",
            website: { url: "", label: "" },
            description: "",
            options: { showLinkInTitle: false },
          },
        ],
      },
      certifications: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            title: "",
            issuer: "",
            date: "",
            website: { url: "", label: "" },
            description: "",
            options: { showLinkInTitle: false },
          },
        ],
      },
      publications: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            title: "",
            publisher: "",
            date: "",
            website: { url: "", label: "" },
            description: "",
            options: { showLinkInTitle: false },
          },
        ],
      },
      volunteer: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            organization: "",
            location: "",
            period: "",
            website: { url: "", label: "" },
            description: "",
            options: { showLinkInTitle: false },
          },
        ],
      },
      references: {
        title: "",
        columns: 1,
        hidden: false,
        items: [
          {
            id: "",
            hidden: false,
            name: "",
            position: "",
            website: { url: "", label: "" },
            phone: "",
            description: "",
            options: { showLinkInTitle: false },
          },
        ],
      },
    },
    customSections: [],
    metadata: {
      template: "onyx",
      layout: {
        sidebarWidth: 35,
        pages: [
          {
            fullWidth: false,
            main: [
              "profiles",
              "summary",
              "education",
              "experience",
              "projects",
              "volunteer",
              "references",
            ],
            sidebar: [
              "skills",
              "certifications",
              "awards",
              "languages",
              "interests",
              "publications",
            ],
          },
        ],
      },
      css: { enabled: false, value: "" },
      page: {
        gapX: 4,
        gapY: 6,
        marginX: 14,
        marginY: 12,
        format: "a4",
        locale: "en-US",
        hideIcons: false,
      },
      design: {
        colors: {
          primary: "rgba(220, 38, 38, 1)",
          text: "rgba(0, 0, 0, 1)",
          background: "rgba(255, 255, 255, 1)",
        },
        level: {
          icon: "star",
          type: "circle",
        },
      },
      typography: {
        body: {
          fontFamily: "IBM Plex Serif",
          fontWeights: ["400", "500"],
          fontSize: 10,
          lineHeight: 1.5,
        },
        heading: {
          fontFamily: "IBM Plex Serif",
          fontWeights: ["600"],
          fontSize: 14,
          lineHeight: 1.5,
        },
      },
      notes: "",
    },
  };

  return `
The resume input is provided in the request.
Return the final JSON object only.

Use this exact target shape and keys:
${JSON.stringify(template, null, 2)}
`.trim();
}

function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(?:#x([0-9a-fA-F]+)|#([0-9]+)|amp|lt|gt|quot|apos);/g,
    (match, hex, dec) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (dec) return String.fromCodePoint(Number.parseInt(dec, 10));
      switch (match) {
        case "&amp;":
          return "&";
        case "&lt;":
          return "<";
        case "&gt;":
          return ">";
        case "&quot;":
          return '"';
        case "&apos;":
          return "'";
        default:
          return match;
      }
    },
  );
}

function normalizeDocxXmlText(xml: string): string {
  return decodeXmlEntities(
    xml
      .replace(/<w:tab\b[^>]*\/>/g, "\t")
      .replace(/<w:br\b[^>]*\/>/g, "\n")
      .replace(/<w:cr\b[^>]*\/>/g, "\n")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<\/w:tr>/g, "\n")
      .replace(/<\/w:tc>/g, "\t")
      .replace(/<w:t\b[^>]*>/g, "")
      .replace(/<\/w:t>/g, "")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfText(decoded: Buffer): Promise<string> {
  try {
    const { default: pdfParse } = await import("pdf-parse");
    const data = (await pdfParse(decoded)) as { text?: string };
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (!text) {
      throw badRequest("Resume PDF did not contain readable text.");
    }
    return text;
  } catch (error) {
    if (error instanceof AppError && error.status === 400) {
      throw error;
    }
    throw badRequest("Resume PDF file could not be read or is encrypted.");
  }
}

async function extractDocxText(decoded: Buffer): Promise<string> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(decoded);
  } catch {
    throw badRequest("Resume DOCX file could not be read.");
  }

  const documentXml = zip.file("word/document.xml");
  if (!documentXml) {
    throw badRequest("Resume DOCX file is missing document content.");
  }

  const xml = await documentXml.async("string");
  const text = normalizeDocxXmlText(xml);
  if (!text) {
    throw badRequest("Resume DOCX file did not contain readable text.");
  }

  return text;
}

function buildDocxPrompt(documentText: string, fileName: string): string {
  return `
The resume file was uploaded as DOCX and converted locally to plain text before extraction.
File name: ${fileName}

Extracted resume text:
${documentText}

${buildUserPrompt()}
`.trim();
}

function buildTextExtractPrompt(
  documentText: string,
  fileName: string,
  source: "DOCX" | "PDF",
): string {
  const sourceLine =
    source === "DOCX"
      ? "The resume file was uploaded as DOCX and converted locally to plain text before extraction."
      : "The resume file was uploaded as PDF and converted locally to plain text before extraction.";
  return `
${sourceLine}
File name: ${fileName}

Extracted resume text:
${documentText}

${buildUserPrompt()}
`.trim();
}

function normalizeGeminiModelName(value: string): string {
  return value
    .trim()
    .replace(/^models\//, "")
    .replace(/^google\//, "");
}

function extractOpenAiOutputText(response: unknown): string | null {
  const payload = asRecord(response);
  const outputText = trimText(payload?.output_text);
  if (outputText) return outputText;

  const output = asArray(payload?.output);
  for (const item of output) {
    const content = asArray(asRecord(item)?.content);
    for (const part of content) {
      if (trimText(asRecord(part)?.type) !== "output_text") continue;
      const text = trimText(asRecord(part)?.text);
      if (text) return text;
    }
  }

  return null;
}

function extractChatCompletionText(response: unknown): string | null {
  const payload = asRecord(response);
  const choices = asArray(payload?.choices);
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  return trimText(message?.content) || null;
}

function extractGeminiText(response: unknown): string | null {
  const payload = asRecord(response);
  const candidates = asArray(payload?.candidates);
  const firstCandidate = asRecord(candidates[0]);
  const parts = asArray(asRecord(firstCandidate?.content)?.parts);
  const text = parts
    .filter((part) => !asRecord(part)?.thought)
    .map((part) => trimText(asRecord(part)?.text))
    .filter(Boolean)
    .join("");
  return text || null;
}

function extractProbablyJsonObject(content: string): string {
  const stripped = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const firstBrace = stripped.indexOf("{");
  const lastBrace = stripped.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return stripped;
  }
  return stripped.slice(firstBrace, lastBrace + 1).trim();
}

function repairLikelyJson(candidate: string): string {
  return candidate
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .replaceAll("\u0000", "")
    .trim();
}

function parseImportedResumeJson(content: string): unknown {
  const candidate = extractProbablyJsonObject(content);
  const repaired = repairLikelyJson(candidate);

  try {
    return JSON.parse(repaired) as unknown;
  } catch {
    try {
      return JSON.parse(jsonrepair(repaired)) as unknown;
    } catch (error) {
      throw badRequest(
        `Imported resume did not produce valid JSON. ${error instanceof Error ? error.message : "Unknown parsing error."}`,
      );
    }
  }
}

function filterRequiredItems(items: unknown, requiredField: string): unknown[] {
  return asArray(items).filter((item) =>
    trimText(asRecord(item)?.[requiredField]),
  );
}

function sanitizeNormalizedResume(input: unknown): DesignResumeJson {
  const normalized = normalizeReactiveResumeV5Document(input) as RecordLike;
  const sections = asRecord(normalized.sections) ?? {};

  normalized.sections = {
    ...sections,
    profiles: {
      ...asRecord(sections.profiles),
      items: filterRequiredItems(asRecord(sections.profiles)?.items, "network"),
    },
    experience: {
      ...asRecord(sections.experience),
      items: filterRequiredItems(
        asRecord(sections.experience)?.items,
        "company",
      ),
    },
    education: {
      ...asRecord(sections.education),
      items: filterRequiredItems(asRecord(sections.education)?.items, "school"),
    },
    projects: {
      ...asRecord(sections.projects),
      items: filterRequiredItems(asRecord(sections.projects)?.items, "name"),
    },
    skills: {
      ...asRecord(sections.skills),
      items: filterRequiredItems(asRecord(sections.skills)?.items, "name"),
    },
    languages: {
      ...asRecord(sections.languages),
      items: filterRequiredItems(
        asRecord(sections.languages)?.items,
        "language",
      ),
    },
    interests: {
      ...asRecord(sections.interests),
      items: filterRequiredItems(asRecord(sections.interests)?.items, "name"),
    },
    awards: {
      ...asRecord(sections.awards),
      items: filterRequiredItems(asRecord(sections.awards)?.items, "title"),
    },
    certifications: {
      ...asRecord(sections.certifications),
      items: filterRequiredItems(
        asRecord(sections.certifications)?.items,
        "title",
      ),
    },
    publications: {
      ...asRecord(sections.publications),
      items: filterRequiredItems(
        asRecord(sections.publications)?.items,
        "title",
      ),
    },
    volunteer: {
      ...asRecord(sections.volunteer),
      items: filterRequiredItems(
        asRecord(sections.volunteer)?.items,
        "organization",
      ),
    },
    references: {
      ...asRecord(sections.references),
      items: filterRequiredItems(asRecord(sections.references)?.items, "name"),
    },
  };

  const parsed = safeParseV5ResumeData(normalized);
  if (!parsed.success) {
    throw badRequest(
      `Imported resume could not be normalized into a valid Design Resume. ${getResumeSchemaValidationMessage(parsed.error)}`,
    );
  }

  return parsed.data as DesignResumeJson;
}

function buildCapabilityErrorMessage(provider: string): string {
  return `Resume file import is not available for the current AI provider (${provider}). Connect OpenAI, OpenRouter, Gemini, or Gemini (CLI) to import resumes. DOCX files are converted to text locally before extraction. PDFs with Gemini (CLI) are converted to plain text locally before extraction.`;
}

function isFileCapabilityError(message: string): boolean {
  const normalized = message.toLowerCase();
  const fileSignal = [
    "input file",
    "input-file",
    "input_file",
    "file_data",
    "file data",
    "inline_data",
    "inline data",
    "attachment",
    "attached file",
  ].some((pattern) => normalized.includes(pattern));
  const capabilitySignal = [
    "does not support",
    "not support",
    "unsupported",
    "not available",
    "native file support",
    "native",
    "modality",
  ].some((pattern) => normalized.includes(pattern));
  return fileSignal && capabilitySignal;
}

function shouldRetryOpenRouterPdfWithAlternateEngine(input: {
  status: number;
  message: string;
}): boolean {
  if (input.status < 400 || input.status >= 500) {
    return false;
  }

  const normalized = input.message.toLowerCase();
  return [
    "file",
    "pdf",
    "document",
    "attachment",
    "parser",
    "plugin",
    "input_file",
    "file_data",
    "inline_data",
    "native",
  ].some((pattern) => normalized.includes(pattern));
}

async function extractWithOpenAi(args: {
  apiKey: string;
  baseUrl: string | null;
  model: string;
  mediaType: SupportedImportMediaType;
  fileName: string;
  dataBase64: string;
  documentText?: string | null;
  requestId: string | undefined;
}): Promise<string> {
  const url = joinUrl(
    args.baseUrl || "https://api.openai.com",
    "/v1/responses",
  );
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders({
      apiKey: args.apiKey,
      provider: "openai",
    }),
    body: JSON.stringify({
      model: args.model,
      text: {
        format: {
          type: "json_object",
        },
      },
      input: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: args.documentText
            ? [
                {
                  type: "input_text",
                  text: buildDocxPrompt(args.documentText, args.fileName),
                },
              ]
            : [
                {
                  type: "input_text",
                  text: buildUserPrompt(),
                },
                {
                  type: "input_file",
                  filename: args.fileName,
                  file_data: buildDataUrl(args.mediaType, args.dataBase64),
                },
              ],
        },
      ],
    }),
    signal: AbortSignal.timeout(OPENAI_DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = parseErrorMessage(await getResponseDetail(response));
    throw new AppError({
      status: response.status >= 500 ? 502 : 503,
      message: detail || `OpenAI returned ${response.status}.`,
      details: {
        provider: "openai",
        model: args.model,
        requestId: args.requestId ?? null,
      },
    });
  }

  const payload = await response.json();
  const text = extractOpenAiOutputText(payload);
  if (!text) {
    throw upstreamError("OpenAI returned an empty response for resume import.");
  }
  return text;
}

async function extractWithOpenRouter(args: {
  apiKey: string;
  baseUrl: string | null;
  model: string;
  mediaType: SupportedImportMediaType;
  fileName: string;
  dataBase64: string;
  documentText?: string | null;
  requestId: string | undefined;
}): Promise<string> {
  const url = joinUrl(
    args.baseUrl || "https://openrouter.ai",
    "/api/v1/chat/completions",
  );
  const pdfEngines =
    args.mediaType === "application/pdf"
      ? (["cloudflare-ai", "mistral-ocr", null] as const)
      : ([null] as const);

  let lastError: AppError | null = null;
  for (const engine of pdfEngines) {
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders({
        apiKey: args.apiKey,
        provider: "openrouter",
      }),
      body: JSON.stringify({
        model: args.model,
        stream: false,
        response_format: {
          type: "json_object",
        },
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: args.documentText
              ? buildDocxPrompt(args.documentText, args.fileName)
              : [
                  {
                    type: "text",
                    text: buildUserPrompt(),
                  },
                  {
                    type: "file",
                    file: {
                      filename: args.fileName,
                      file_data: buildDataUrl(args.mediaType, args.dataBase64),
                    },
                  },
                ],
          },
        ],
        ...(args.mediaType === "application/pdf" && engine
          ? {
              plugins: [
                {
                  id: "file-parser",
                  pdf: {
                    engine,
                  },
                },
              ],
            }
          : {}),
      }),
      signal: AbortSignal.timeout(OPENROUTER_DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = parseErrorMessage(await getResponseDetail(response));
      const appError = new AppError({
        status: response.status >= 500 ? 502 : 503,
        message: detail || `OpenRouter returned ${response.status}.`,
        details: {
          provider: "openrouter",
          model: args.model,
          requestId: args.requestId ?? null,
          pdfEngine: engine,
        },
      });

      lastError = appError;
      if (
        args.mediaType !== "application/pdf" ||
        !shouldRetryOpenRouterPdfWithAlternateEngine({
          status: response.status,
          message: appError.message,
        })
      ) {
        throw appError;
      }
      continue;
    }

    const payload = await response.json();
    const text = extractChatCompletionText(payload);
    if (!text) {
      throw upstreamError(
        "OpenRouter returned an empty response for resume import.",
      );
    }
    return text;
  }

  throw (
    lastError ??
    upstreamError("OpenRouter returned an empty response for resume import.")
  );
}

async function extractWithGemini(args: {
  apiKey: string;
  baseUrl: string | null;
  model: string;
  mediaType: SupportedImportMediaType;
  dataBase64: string;
  documentText?: string | null;
  fileName: string;
  requestId: string | undefined;
}): Promise<string> {
  const model = normalizeGeminiModelName(args.model);
  const baseUrl = args.baseUrl || "https://generativelanguage.googleapis.com";
  const url = `${joinUrl(baseUrl, `/v1beta/models/${encodeURIComponent(model)}:generateContent`)}?key=${encodeURIComponent(args.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders({
      apiKey: null,
      provider: "gemini",
    }),
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: "user",
          parts: args.documentText
            ? [
                {
                  text: buildDocxPrompt(args.documentText, args.fileName),
                },
              ]
            : [
                {
                  text: buildUserPrompt(),
                },
                {
                  inlineData: {
                    mimeType: args.mediaType,
                    data: args.dataBase64,
                  },
                },
              ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
    signal: AbortSignal.timeout(GEMINI_DEFAULT_TIMEOUT_MS),
  });

  if (!response.ok) {
    const detail = parseErrorMessage(await getResponseDetail(response));
    throw new AppError({
      status: response.status >= 500 ? 502 : 503,
      message: detail || `Gemini returned ${response.status}.`,
      details: {
        provider: "gemini",
        model: args.model,
        requestId: args.requestId ?? null,
      },
    });
  }

  const payload = await response.json();
  const text = extractGeminiText(payload);
  if (!text) {
    throw upstreamError("Gemini returned an empty response for resume import.");
  }
  return text;
}

async function extractWithGeminiCli(args: {
  model: string;
  mediaType: SupportedImportMediaType;
  fileName: string;
  documentText: string;
  requestId: string | undefined;
}): Promise<string> {
  const source: "DOCX" | "PDF" =
    args.mediaType === "application/pdf" ? "PDF" : "DOCX";
  const userContent = buildTextExtractPrompt(
    args.documentText,
    args.fileName,
    source,
  );
  const client = new GeminiCliClient();
  try {
    const { text } = await client.callJson({
      model: args.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      jsonSchema: DESIGN_RESUME_IMPORT_CLI_JSON_SCHEMA,
    });
    if (!text?.trim()) {
      throw upstreamError(
        "Gemini CLI returned an empty response for resume import.",
      );
    }
    return text;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw upstreamError(
      truncate(message, 500),
      args.requestId
        ? {
            provider: "gemini_cli",
            model: args.model,
            requestId: args.requestId,
          }
        : { provider: "gemini_cli", model: args.model },
    );
  }
}

async function extractResumeFromProvider(args: {
  provider: SupportedRuntimeProvider;
  apiKey: string;
  baseUrl: string | null;
  model: string;
  mediaType: SupportedImportMediaType;
  fileName: string;
  dataBase64: string;
  documentText?: string | null;
  requestId: string | undefined;
}): Promise<string> {
  if (args.provider === "gemini_cli") {
    const text = args.documentText?.trim();
    if (!text) {
      throw badRequest(
        "Gemini CLI resume import requires plain-text resume content (DOCX or extracted PDF text).",
      );
    }
    return extractWithGeminiCli({
      model: args.model,
      mediaType: args.mediaType,
      fileName: args.fileName,
      documentText: text,
      requestId: args.requestId,
    });
  }
  if (args.provider === "openai") {
    return extractWithOpenAi(args);
  }
  if (args.provider === "openrouter") {
    return extractWithOpenRouter(args);
  }
  return extractWithGemini(args);
}

export async function importDesignResumeFromFile(
  input: ResumeImportFileInput,
): Promise<DesignResumeDocument> {
  const fileName = normalizeFileName(input.fileName);
  const mediaType = normalizeImportMediaType({
    fileName,
    mediaType: input.mediaType,
  });
  const { decoded, normalizedBase64 } = decodeBase64Payload(input.dataBase64);
  const requestId = getRequestId();

  const runtime = await resolveLlmRuntimeSettings();
  const provider = normalizeRuntimeProvider(runtime.provider);

  logger.info("Design resume file import started", {
    requestId: requestId ?? null,
    provider: runtime.provider ?? null,
    model: runtime.model,
    fileName,
    mediaType,
    byteSize: decoded.byteLength,
  });

  if (!provider) {
    throw serviceUnavailable(
      buildCapabilityErrorMessage(runtime.provider ?? "unknown"),
    );
  }

  const isGeminiCli = provider === "gemini_cli";
  if (!isGeminiCli && !runtime.apiKey) {
    throw serviceUnavailable(
      "Connect your AI provider in Settings before importing a resume file.",
    );
  }

  try {
    let documentText: string | null =
      mediaType === DOCX_MIME ? await extractDocxText(decoded) : null;
    if (isGeminiCli && mediaType === "application/pdf") {
      documentText = await extractPdfText(decoded);
    }
    const rawText = await extractResumeFromProvider({
      provider,
      apiKey: runtime.apiKey ?? "",
      baseUrl: runtime.baseUrl,
      model: runtime.model,
      mediaType,
      fileName,
      dataBase64: normalizedBase64,
      documentText,
      requestId,
    });
    const parsed = parseImportedResumeJson(rawText);
    const normalized = sanitizeNormalizedResume(parsed);
    const saved = await replaceCurrentDesignResumeDocument({
      importedAt: new Date().toISOString(),
      resumeJson: normalized,
      sourceMode: null,
      sourceResumeId: null,
    });

    logger.info("Design resume file import completed", {
      requestId: requestId ?? null,
      provider,
      model: runtime.model,
      fileName,
      mediaType,
      documentId: saved.id,
    });

    return saved;
  } catch (error) {
    logger.warn("Design resume file import failed", {
      requestId: requestId ?? null,
      provider,
      model: runtime.model,
      fileName,
      mediaType,
      error: sanitizeUnknown(error),
    });

    if (error instanceof AppError) {
      if (isFileCapabilityError(error.message)) {
        throw serviceUnavailable(
          `The configured ${provider} model could not accept this attached ${mediaType === "application/pdf" ? "PDF" : "DOCX"} file directly. Choose a model with native file support and try again.`,
        );
      }
      if (error.status >= 500) {
        throw upstreamError(error.message, error.details);
      }
      throw error;
    }

    const message =
      error instanceof Error ? error.message : "Resume import failed.";
    if (isFileCapabilityError(message)) {
      throw serviceUnavailable(
        `The configured ${provider} model could not accept this attached ${mediaType === "application/pdf" ? "PDF" : "DOCX"} file directly. Choose a model with native file support and try again.`,
      );
    }

    throw upstreamError(truncate(message, 400));
  }
}
