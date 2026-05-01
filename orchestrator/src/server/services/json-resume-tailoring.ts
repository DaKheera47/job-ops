/**
 * Service for generating complete JSON Resume tailoring using LLM.
 * Replaces the limited summary/headline/skills generation with full resume structure.
 */

import { appendFileSync } from "node:fs";
import { logger } from "@infra/logger";
import { LlmService } from "./llm/service";

// Detailed request/response logging to file
const LOG_FILE = `./logs/tailoring_requests_${Date.now()}.jsonl`;

function logToFile(entry: Record<string, unknown>) {
  try {
    const line = JSON.stringify({ ...entry, _loggedAt: new Date().toISOString() }) + "\n";
    appendFileSync(LOG_FILE, line);
  } catch {
    // Silent fail - file logging is best effort
  }
}
import type { JsonSchemaDefinition } from "./llm/types";
import { createLlmLogEntry, logLlmCall } from "./llm-logging";
import { resolveLlmModel } from "./modelSelection";
import {
  getWritingLanguageLabel,
  resolveWritingOutputLanguage,
} from "./output-language";
import {
  getEffectivePromptTemplate,
  renderPromptTemplate,
} from "./prompt-templates";
import {
  getWritingStyle,
  stripKeywordLimitFromConstraints,
  stripLanguageDirectivesFromConstraints,
  stripWordLimitFromConstraints,
} from "./writing-style";

export interface JsonResumeTailoringInput {
  masterResumeJson: Record<string, unknown>;
  jobDescription: string;
  constraints?: {
    maxPages?: 2 | 3;
    targetKeywords?: string[];
  };
}

export interface JsonResumeTailoringOutput {
  tailoredResumeJson: Record<string, unknown>;
  coverLetter?: string;
  metadata: {
    pageCount: number;
    selectedSkills: string[];
    proofPoints: Record<string, string>;
  };
}

export interface TailoringResult {
  success: boolean;
  data?: JsonResumeTailoringOutput;
  error?: string;
}

/** JSON schema for sequential tailoring - call 1: summary only */
const JSON_RESUME_TAILORING_SEQUENTIAL_SUMMARY_SCHEMA: JsonSchemaDefinition = {
  name: "json_resume_tailoring_sequential_summary",
  schema: {
    type: "object",
    properties: {
      summary: {
        type: "string",
        description: "Tailored resume summary paragraph (max 3 sentences, ~60 words)",
      },
    },
    required: ["summary"],
    additionalProperties: false,
  },
};

/** JSON schema for sequential tailoring - call 2: work only */
const JSON_RESUME_TAILORING_SEQUENTIAL_WORK_SCHEMA: JsonSchemaDefinition = {
  name: "json_resume_tailoring_sequential_work",
  schema: {
    type: "object",
    properties: {
      work: {
        type: "array",
        description: "Work experience with tailored bullet points (company, position, dates are static from master resume)",
        items: {
          type: "object",
          properties: {
            summary: { type: "string", description: "Job summary paragraph (max 2 sentences, ~40 words)" },
            highlights: {
              type: "array",
              items: { type: "string", description: "Tailored bullet points for this role (max 3 bullets, ~15 words each)" },
            },
          },
        },
      },
    },
    required: ["work"],
    additionalProperties: false,
  },
};

/** JSON schema for sequential tailoring - call 3: supporting sections */
const JSON_RESUME_TAILORING_SEQUENTIAL_SUPPORTING_SCHEMA: JsonSchemaDefinition = {
  name: "json_resume_tailoring_sequential_supporting",
  schema: {
    type: "object",
    properties: {
      education: {
        type: "array",
        description: "Education with tailored courses (institution, area, dates are static from master resume)",
        items: {
          type: "object",
          properties: {
            courses: {
              type: "array",
              items: { type: "string", description: "Tailored coursework bullet points" },
            },
          },
        },
      },
      projects: {
        type: "array",
        description: "Selected and tailored projects (names, dates are static from master resume)",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Project name (must match master resume exactly)" },
            description: { type: "string", description: "Tailored project description" },
            keywords: {
              type: "array",
              items: { type: "string", description: "Relevant keywords for this project" },
            },
          },
        },
      },
      skills: {
        type: "array",
        description: "Selected skills with proof points",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Skill category name" },
            keywords: {
              type: "array",
              items: { type: "string", description: "Selected skills in this category" },
            },
            proofPoint: {
              type: "string",
              description: "1-sentence evidence demonstrating this skill from work history",
            },
          },
        },
      },
      certifications: {
        type: "array",
        description: "Selected certifications (name, issuer, date are static from master resume)",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Certification name (must match master resume exactly)" },
            issuer: { type: "string", description: "Issuer name (must match master resume exactly)" },
            date: { type: "string", description: "Certification date (must match master resume exactly)" },
          },
        },
      },
      metadata: {
        type: "object",
        properties: {
          pageCount: {
            type: "number",
            description: "Estimated page count (2 or 3)",
          },
          selectedSkills: {
            type: "array",
            items: { type: "string" },
            description: "Top 5 skills selected for this role",
          },
        },
      },
    },
    required: ["metadata"],
    additionalProperties: false,
  },
};

/**
 * Convert JSON resume data to compact markdown format for token efficiency.
 * This reduces token overhead from JSON syntax (~20-30% savings).
 */
function convertToCompactFormat(data: Record<string, unknown>): string {
  const lines: string[] = [];

  // Handle basics (static fields)
  if (data.basics && typeof data.basics === "object") {
    const basics = data.basics as Record<string, unknown>;
    lines.push("## Basics");
    if (basics.name) lines.push(`Name: ${basics.name}`);
    if (basics.email) lines.push(`Email: ${basics.email}`);
    if (basics.phone) lines.push(`Phone: ${basics.phone}`);
    if (basics.url) lines.push(`Website: ${basics.url}`);
    if (basics.location && typeof basics.location === "object") {
      const loc = basics.location as Record<string, unknown>;
      if (loc.city || loc.countryCode) {
        lines.push(`Location: ${[loc.city, loc.countryCode].filter(Boolean).join(", ")}`);
      }
    }
    if (basics.profiles && Array.isArray(basics.profiles)) {
      lines.push("Profiles:");
      (basics.profiles as Array<Record<string, unknown>>).forEach((p) => {
        if (p.network && p.username) {
          lines.push(`  - ${p.network}: ${p.username}`);
        }
      });
    }
    lines.push("");
  }

  // Handle summary
  if (data.summary && typeof data.summary === "string") {
    lines.push("## Summary");
    lines.push(data.summary);
    lines.push("");
  }

  // Handle work experience
  if (data.work && Array.isArray(data.work)) {
    lines.push("## Work Experience");
    (data.work as Array<Record<string, unknown>>).forEach((w) => {
      const parts = [];
      if (w.company) parts.push(w.company);
      if (w.position) parts.push(`- ${w.position}`);
      if (w.startDate || w.endDate) parts.push(`(${w.startDate} - ${w.endDate})`);
      lines.push(parts.join(" "));
      if (w.summary && typeof w.summary === "string") {
        lines.push(`  ${w.summary}`);
      }
      if (w.highlights && Array.isArray(w.highlights)) {
        (w.highlights as string[]).forEach((h) => {
          lines.push(`  - ${h}`);
        });
      }
      lines.push("");
    });
  }

  // Handle education
  if (data.education && Array.isArray(data.education)) {
    lines.push("## Education");
    (data.education as Array<Record<string, unknown>>).forEach((e) => {
      const parts = [];
      if (e.institution) parts.push(e.institution);
      if (e.area) parts.push(`- ${e.area}`);
      if (e.studyType) parts.push(`(${e.studyType})`);
      if (e.startDate || e.endDate) parts.push(`(${e.startDate} - ${e.endDate})`);
      lines.push(parts.join(" "));
      if (e.courses && Array.isArray(e.courses)) {
        lines.push("  Courses:");
        (e.courses as string[]).forEach((c) => {
          lines.push(`    - ${c}`);
        });
      }
      lines.push("");
    });
  }

  // Handle projects
  if (data.projects && Array.isArray(data.projects)) {
    lines.push("## Projects");
    (data.projects as Array<Record<string, unknown>>).forEach((p) => {
      const parts = [];
      if (p.name) parts.push(p.name);
      if (p.startDate || p.endDate) parts.push(`(${p.startDate} - ${p.endDate})`);
      lines.push(parts.join(" "));
      if (p.description && typeof p.description === "string") {
        lines.push(`  ${p.description}`);
      }
      if (p.keywords && Array.isArray(p.keywords)) {
        lines.push(`  Keywords: ${(p.keywords as string[]).join(", ")}`);
      }
      lines.push("");
    });
  }

  // Handle skills
  if (data.skills && Array.isArray(data.skills)) {
    lines.push("## Skills");
    (data.skills as Array<Record<string, unknown>>).forEach((s) => {
      const parts = [];
      if (s.name) parts.push(s.name);
      if (s.keywords && Array.isArray(s.keywords)) {
        parts.push(`: ${(s.keywords as string[]).join(", ")}`);
      }
      lines.push(parts.join(""));
    });
    lines.push("");
  }

  // Handle certifications (or awards - master resume uses awards)
  const certifications = (data.certifications || data.awards) as Array<Record<string, unknown>> | undefined;
  if (certifications && Array.isArray(certifications)) {
    lines.push("## Certifications");
    certifications.forEach((c) => {
      const parts = [];
      const name = c.name || c.title; // awards uses "title", certifications uses "name"
      const issuer = c.issuer || c.awarder; // awards uses "awarder", certifications uses "issuer"
      if (name) parts.push(name);
      if (issuer) parts.push(`- ${issuer}`);
      if (c.date) parts.push(`(${c.date})`);
      lines.push(parts.join(" "));
    });
  }

  return lines.join("\n");
}

/**
 * Call Python Tailoring Service via HTTP API.
 * Returns null if service is unavailable.
 */
async function callPythonTailoringService(
  input: JsonResumeTailoringInput,
  context?: { jobId?: string; pipelineRunId?: string },
): Promise<TailoringResult | null> {
  // Immediate log to confirm this function is being called
  // eslint-disable-next-line no-console
  console.log("[TYPESCRIPT] >>> CALLING PYTHON SERVICE for job:", context?.jobId);
  
  try {
    const writingStyle = await getWritingStyle();
    const constraints = {
      maxPages: input.constraints?.maxPages ?? 2,
      targetKeywords: input.constraints?.targetKeywords ?? [],
    };

    const pythonServiceUrl = process.env.PYTHON_TAILORING_SERVICE_URL ?? "http://localhost:8000";
    const response = await fetch(`${pythonServiceUrl}/tailor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jobDescription: input.jobDescription,
        masterResumeJson: input.masterResumeJson,
        writingStyle: {
          tone: writingStyle.tone,
          formality: writingStyle.formality,
          manualLanguage: writingStyle.manualLanguage,
        },
        constraints,
      }),
    });

    if (!response.ok) {
      logger.warn("Python tailoring service returned error", {
        jobId: context?.jobId,
        status: response.status,
      });
      return null;
    }

    const result = await response.json();
    
    // Log what we received from Python service
    const summaryReceived = result.data?.tailoredResumeJson?.summary;
    logger.info("Python service response received", {
      jobId: context?.jobId,
      success: result.success,
      hasSummary: !!summaryReceived,
      summaryPreview: typeof summaryReceived === "string" ? summaryReceived.substring(0, 100) : "(none)",
    });
    // eslint-disable-next-line no-console
    console.log("[TYPESCRIPT] Python response:", { 
      success: result.success, 
      hasSummary: !!summaryReceived,
      summaryPreview: typeof summaryReceived === "string" ? summaryReceived.substring(0, 150) : "(none)"
    });
    
    // Log to file for debugging
    logToFile({
      type: "python_service_response",
      jobId: context?.jobId,
      success: result.success,
      hasSummary: !!summaryReceived,
      summaryPreview: typeof summaryReceived === "string" ? summaryReceived.substring(0, 500) : "(none)",
      fullResponse: result,
    });
    
    if (result.success && result.data) {
      return {
        success: true,
        data: {
          tailoredResumeJson: result.data.tailoredResumeJson,
          coverLetter: result.coverLetter,
          metadata: {
            pageCount: result.data.metadata?.pageCount ?? 2,
            selectedSkills: result.data.metadata?.selectedSkills ?? [],
            proofPoints: result.data.metadata?.proofPoints ?? {},
          },
        },
      };
    }

    return { success: false, error: result.error || "Unknown error from Python service" };
  } catch (error) {
    logger.warn("Python tailoring service unavailable, falling back to TypeScript implementation", {
      jobId: context?.jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Generate JSON Resume tailoring using 3 sequential LLM calls:
 * 1. Summary only
 * 2. Work (with summary context)
 * 3. Supporting sections (with summary + work context)
 * Falls back to master resume data if any call fails.
 * 
 * First tries Python Tailoring Service (Instructor + Prefect), then falls back
 * to TypeScript implementation if unavailable.
 */
export async function generateJsonResumeTailoring(
  input: JsonResumeTailoringInput,
  context?: { jobId?: string; pipelineRunId?: string },
): Promise<TailoringResult> {
  // eslint-disable-next-line no-console
  console.log("[TYPESCRIPT] generateJsonResumeTailoring START for job:", context?.jobId);
  
  // Try Python service first
  const pythonResult = await callPythonTailoringService(input, context);
  // eslint-disable-next-line no-console
  console.log("[TYPESCRIPT] Python result received:", pythonResult ? "YES" : "NO (null)");
  
  if (pythonResult) {
    const summary = pythonResult.data?.tailoredResumeJson?.summary;
    logger.info("Using Python Tailoring Service result", { 
      jobId: context?.jobId,
      hasSummary: !!summary,
      summaryPreview: typeof summary === "string" ? summary.substring(0, 100) : "(none)",
    });
    return pythonResult;
  }

  // DISABLED: TypeScript fallback - Python service is required
  // eslint-disable-next-line no-console
  console.error("[TYPESCRIPT] PYTHON SERVICE FAILED - No fallback available");
  return { 
    success: false, 
    error: `Python Tailoring Service failed: ${pythonResult === null ? 'Service unavailable or returned null' : 'Unknown error'}` 
  };
}
