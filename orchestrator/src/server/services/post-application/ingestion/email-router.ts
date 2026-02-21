import { getSetting } from "@server/repositories/settings";
import { LlmService } from "@server/services/llm/service";
import type { JsonSchemaDefinition } from "@server/services/llm/types";
import {
  messageTypeFromStageTarget,
  normalizeStageTarget,
} from "@server/services/post-application/stage-target";
import type {
  Job,
  PostApplicationMessageType,
  PostApplicationRouterStageTarget,
} from "@shared/types";
import { POST_APPLICATION_ROUTER_STAGE_TARGETS } from "@shared/types";

export const ROUTER_EMAIL_CHAR_LIMIT = 12_000;

const SMART_ROUTER_SCHEMA: JsonSchemaDefinition = {
  name: "post_application_email_router",
  schema: {
    type: "object",
    properties: {
      bestMatchIndex: {
        type: ["integer", "null"],
        description:
          "Best matching active-job index from provided list (1-based), or null.",
      },
      confidence: {
        type: "integer",
        description: "Confidence score 0-100 for routing decision.",
      },
      stageTarget: {
        type: "string",
        enum: [...POST_APPLICATION_ROUTER_STAGE_TARGETS],
        description:
          "Normalized stage target for this message, matching Log Event options.",
      },
      isRelevant: {
        type: "boolean",
        description:
          "Whether this is a relevant recruitment/application email.",
      },
      stageEventPayload: {
        type: ["object", "null"],
        description: "Structured metadata for a potential stage event.",
        additionalProperties: true,
      },
      reason: {
        type: "string",
        description: "One sentence reason for the routing decision.",
      },
    },
    required: [
      "bestMatchIndex",
      "confidence",
      "stageTarget",
      "isRelevant",
      "stageEventPayload",
      "reason",
    ],
    additionalProperties: false,
  },
};

export type IndexedActiveJob = {
  index: number;
  id: string;
  company: string;
  title: string;
};

export type SmartRouterResult = {
  bestMatchId: string | null;
  confidence: number;
  stageTarget: PostApplicationRouterStageTarget;
  messageType: PostApplicationMessageType;
  isRelevant: boolean;
  stageEventPayload: Record<string, unknown> | null;
  reason: string;
};

export function minifyActiveJobs(jobs: Job[]): Array<{
  id: string;
  company: string;
  title: string;
}> {
  return jobs.map((job) => ({
    id: job.id,
    company: job.employer,
    title: job.title,
  }));
}

function sanitizeJobPromptValue(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function buildIndexedActiveJobs(
  jobs: Array<{ id: string; company: string; title: string }>,
): IndexedActiveJob[] {
  return jobs.map((job, offset) => ({
    index: offset + 1,
    id: job.id,
    company: sanitizeJobPromptValue(job.company || "Unknown company"),
    title: sanitizeJobPromptValue(job.title || "Unknown title"),
  }));
}

export function buildCompactActiveJobsList(jobs: IndexedActiveJob[]): string {
  return jobs
    .map((job) => `${job.index}. ${job.company}: ${job.title}`)
    .join("\n");
}

export function normalizeBestMatchIndex(
  value: unknown,
  max: number,
): number | null {
  if (value === null || value === undefined || max <= 0) return null;
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < 1 || rounded > max) return null;
  return rounded;
}

export async function classifyWithSmartRouter(args: {
  emailText: string;
  activeJobs: Array<{ id: string; company: string; title: string }>;
}): Promise<SmartRouterResult> {
  const overrideModel = await getSetting("model");
  const model =
    overrideModel || process.env.MODEL || "google/gemini-3-flash-preview";
  const llmEmailText = args.emailText.slice(0, ROUTER_EMAIL_CHAR_LIMIT);
  const indexedActiveJobs = buildIndexedActiveJobs(args.activeJobs);
  const compactActiveJobsList = buildCompactActiveJobsList(indexedActiveJobs);
  const messages = [
    {
      role: "system" as const,
      content:
        "You are a smart router for post-application emails. Return only strict JSON. Ignore sensitive data and include only routing fields.",
    },
    {
      role: "user" as const,
      content: `Route this email to one active job if possible.
- Choose bestMatchIndex only from listed job numbers (1-based), or null.
- confidence is 0..100.
- stageTarget must be one of: ${POST_APPLICATION_ROUTER_STAGE_TARGETS.join("|")}.
- isRelevant should be true for recruitment/application lifecycle emails.
- stageEventPayload should be minimal structured data or null.

Active jobs (index. company: title):
${compactActiveJobsList}

Email:
${llmEmailText}`,
    },
  ];

  const llm = new LlmService();
  const result = await llm.callJson<{
    bestMatchIndex: number | null;
    confidence: number;
    stageTarget: string;
    isRelevant: boolean;
    stageEventPayload: Record<string, unknown> | null;
    reason: string;
  }>({
    model,
    messages,
    jsonSchema: SMART_ROUTER_SCHEMA,
    maxRetries: 1,
    retryDelayMs: 400,
  });

  if (!result.success) {
    throw new Error(`LLM classification failed: ${result.error}`);
  }

  const confidence = Math.max(
    0,
    Math.min(100, Math.round(Number(result.data.confidence) || 0)),
  );
  const bestMatchIndex = normalizeBestMatchIndex(
    result.data.bestMatchIndex,
    indexedActiveJobs.length,
  );
  const bestMatchId =
    bestMatchIndex !== null
      ? (indexedActiveJobs[bestMatchIndex - 1]?.id ?? null)
      : null;
  const stageTarget =
    normalizeStageTarget(result.data.stageTarget) ?? "no_change";
  const messageType = messageTypeFromStageTarget(stageTarget);

  return {
    bestMatchId,
    confidence,
    stageTarget,
    messageType,
    isRelevant: Boolean(result.data.isRelevant),
    stageEventPayload:
      result.data.stageEventPayload &&
      typeof result.data.stageEventPayload === "object"
        ? result.data.stageEventPayload
        : null,
    reason: String(result.data.reason ?? "").trim(),
  };
}
