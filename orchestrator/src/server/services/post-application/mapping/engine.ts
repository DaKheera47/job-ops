import { getAllJobs } from "@server/repositories/jobs";
import { replacePostApplicationMessageCandidates } from "@server/repositories/post-application-message-candidates";
import { updatePostApplicationMessageSuggestion } from "@server/repositories/post-application-messages";
import { getSetting } from "@server/repositories/settings";
import {
  type JsonSchemaDefinition,
  LlmService,
} from "@server/services/llm-service";
import type { Job, PostApplicationMessage } from "@shared/types";

const MAPPING_HIGH_CONFIDENCE_THRESHOLD = 95;
const MAPPING_MIN_CONFIDENCE_THRESHOLD = 60;
const MAX_CANDIDATES = 5;

const RERANK_SCHEMA: JsonSchemaDefinition = {
  name: "post_application_job_mapping_rerank",
  schema: {
    type: "object",
    properties: {
      jobId: {
        type: "string",
        description: "Chosen best matching job id from candidate list.",
      },
      score: {
        type: "integer",
        description: "Confidence score from 0-100.",
      },
      reason: {
        type: "string",
        description: "One sentence explanation.",
      },
    },
    required: ["jobId", "score", "reason"],
    additionalProperties: false,
  },
};

type DeterministicCandidate = {
  jobId: string;
  score: number;
  reasons: string[];
};

type MappingResult = {
  matchedJobId: string | null;
  score: number;
  method: "keyword" | "llm_rerank";
};

type MessageSignals = {
  companyName: string;
  jobTitle: string;
  fromDomain: string;
  subject: string;
  snippet: string;
  receivedAt: number;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length > 1);
}

function overlapScore(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared += 1;
  }
  return shared / Math.max(left.size, right.size);
}

function deriveSignals(message: PostApplicationMessage): MessageSignals {
  const payload =
    (message.classificationPayload as Record<string, unknown> | null) ?? null;
  const companyName =
    typeof payload?.companyName === "string" ? payload.companyName : "";
  const jobTitle =
    typeof payload?.jobTitle === "string" ? payload.jobTitle : "";

  return {
    companyName,
    jobTitle,
    fromDomain: normalize(message.fromDomain ?? ""),
    subject: message.subject,
    snippet: message.snippet,
    receivedAt: message.receivedAt,
  };
}

function employerDomainCandidate(job: Job): string {
  const direct = job.companyUrlDirect ?? job.employerUrl ?? "";
  if (!direct) return "";
  try {
    return normalize(new URL(direct).hostname.replace(/^www\./, ""));
  } catch {
    return normalize(direct.replace(/^https?:\/\//, "").replace(/^www\./, ""));
  }
}

function scoreJobCandidate(
  message: PostApplicationMessage,
  job: Job,
): DeterministicCandidate {
  const signals = deriveSignals(message);
  const reasons: string[] = [];

  const employerSimilarity = Math.max(
    overlapScore(signals.companyName, job.employer),
    overlapScore(message.subject, job.employer),
  );
  const companyScore = Math.round(employerSimilarity * 40);
  if (companyScore > 0) reasons.push(`company:${companyScore}`);

  const titleSimilarity = Math.max(
    overlapScore(signals.jobTitle, job.title),
    overlapScore(message.subject, job.title),
    overlapScore(message.snippet, job.title),
  );
  const titleScore = Math.round(titleSimilarity * 30);
  if (titleScore > 0) reasons.push(`title:${titleScore}`);

  const employerTokens = tokenize(job.employer);
  const fromDomainMatch = employerTokens.some((token) =>
    signals.fromDomain.includes(token),
  )
    ? 1
    : 0;
  const employerDomain = employerDomainCandidate(job);
  const directDomainMatch =
    employerDomain && signals.fromDomain.includes(employerDomain) ? 1 : 0;
  const domainScore = (fromDomainMatch || directDomainMatch) * 20;
  if (domainScore > 0) reasons.push(`domain:${domainScore}`);

  const referenceTime = job.appliedAt ? Date.parse(job.appliedAt) : NaN;
  let timeScore = 2;
  if (Number.isFinite(referenceTime)) {
    const diffDays = Math.abs(signals.receivedAt - referenceTime) / 86_400_000;
    if (diffDays <= 3) timeScore = 10;
    else if (diffDays <= 14) timeScore = 7;
    else if (diffDays <= 45) timeScore = 4;
    else timeScore = 1;
  }
  reasons.push(`time:${timeScore}`);

  const score = Math.max(
    0,
    Math.min(100, companyScore + titleScore + domainScore + timeScore),
  );
  return {
    jobId: job.id,
    score,
    reasons,
  };
}

function pickTopCandidates(
  message: PostApplicationMessage,
  jobs: Job[],
): DeterministicCandidate[] {
  return jobs
    .map((job) => scoreJobCandidate(message, job))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

async function rerankWithLlm(args: {
  message: PostApplicationMessage;
  candidates: DeterministicCandidate[];
  jobsById: Map<string, Job>;
}): Promise<MappingResult | null> {
  if (args.candidates.length === 0) return null;

  const overrideModel = await getSetting("model");
  const model =
    overrideModel || process.env.MODEL || "google/gemini-3-flash-preview";

  const messagePayload = {
    fromAddress: args.message.fromAddress,
    subject: args.message.subject,
    snippet: args.message.snippet,
    companyName:
      (args.message.classificationPayload as Record<string, unknown> | null)
        ?.companyName ?? null,
    jobTitle:
      (args.message.classificationPayload as Record<string, unknown> | null)
        ?.jobTitle ?? null,
  };

  const candidatePayload = args.candidates.map((candidate) => {
    const job = args.jobsById.get(candidate.jobId);
    return {
      jobId: candidate.jobId,
      employer: job?.employer ?? "",
      title: job?.title ?? "",
      appliedAt: job?.appliedAt ?? null,
      deterministicScore: candidate.score,
    };
  });

  const llm = new LlmService();
  const result = await llm.callJson<{
    jobId: string;
    score: number;
    reason: string;
  }>({
    model,
    messages: [
      {
        role: "system",
        content:
          "You rerank job mapping candidates. Pick one job from candidates or low confidence if weak.",
      },
      {
        role: "user",
        content: `Map this post-application email to the most likely job in candidates.
Return one candidate jobId only, with score 0-100 and reason.

Email:
${JSON.stringify(messagePayload)}

Candidates:
${JSON.stringify(candidatePayload)}`,
      },
    ],
    jsonSchema: RERANK_SCHEMA,
    maxRetries: 1,
    retryDelayMs: 400,
  });

  if (!result.success) return null;

  const score = Math.max(0, Math.min(100, Math.round(result.data.score)));
  if (!args.jobsById.has(result.data.jobId)) return null;

  return {
    matchedJobId:
      score >= MAPPING_MIN_CONFIDENCE_THRESHOLD ? result.data.jobId : null,
    score,
    method: "llm_rerank",
  };
}

async function persistMappingResult(args: {
  message: PostApplicationMessage;
  deterministicCandidates: DeterministicCandidate[];
  result: MappingResult | null;
}): Promise<void> {
  const chosenJobId = args.result?.matchedJobId ?? null;
  const chosenScore = args.result?.score ?? 0;
  const chosenMethod = args.result?.method ?? "keyword";

  await replacePostApplicationMessageCandidates({
    messageId: args.message.id,
    candidates: args.deterministicCandidates.map((candidate, index) => {
      const selected = candidate.jobId === chosenJobId;
      return {
        jobId: candidate.jobId,
        score: selected ? chosenScore : candidate.score,
        rank: index + 1,
        reasons: candidate.reasons,
        matchMethod: selected
          ? chosenMethod
          : chosenMethod === "llm_rerank"
            ? "hybrid"
            : "keyword",
        isHighConfidence:
          selected && chosenScore >= MAPPING_HIGH_CONFIDENCE_THRESHOLD,
      };
    }),
  });

  await updatePostApplicationMessageSuggestion({
    id: args.message.id,
    matchedJobId: chosenJobId,
    reviewStatus: "pending_review",
  });
}

export async function runJobMappingForMessage(args: {
  message: PostApplicationMessage;
  jobsOverride?: Job[];
}): Promise<{
  matchedJobId: string | null;
  score: number;
  usedLlmRerank: boolean;
}> {
  const jobs = args.jobsOverride ?? (await getAllJobs(["applied", "ready"]));
  const topCandidates = pickTopCandidates(args.message, jobs);
  if (topCandidates.length === 0) {
    await updatePostApplicationMessageSuggestion({
      id: args.message.id,
      matchedJobId: null,
      reviewStatus: "pending_review",
    });
    return { matchedJobId: null, score: 0, usedLlmRerank: false };
  }

  const top = topCandidates[0];
  if (top.score >= MAPPING_HIGH_CONFIDENCE_THRESHOLD) {
    const result: MappingResult = {
      matchedJobId: top.jobId,
      score: top.score,
      method: "keyword",
    };
    await persistMappingResult({
      message: args.message,
      deterministicCandidates: topCandidates,
      result,
    });
    return { matchedJobId: top.jobId, score: top.score, usedLlmRerank: false };
  }

  if (top.score < MAPPING_MIN_CONFIDENCE_THRESHOLD) {
    await persistMappingResult({
      message: args.message,
      deterministicCandidates: topCandidates,
      result: null,
    });
    return { matchedJobId: null, score: top.score, usedLlmRerank: false };
  }

  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const llmResult = await rerankWithLlm({
    message: args.message,
    candidates: topCandidates,
    jobsById,
  });

  const result = llmResult ?? {
    matchedJobId:
      top.score >= MAPPING_MIN_CONFIDENCE_THRESHOLD ? top.jobId : null,
    score: top.score,
    method: "keyword" as const,
  };
  await persistMappingResult({
    message: args.message,
    deterministicCandidates: topCandidates,
    result,
  });
  return {
    matchedJobId: result.matchedJobId,
    score: result.score,
    usedLlmRerank: Boolean(llmResult),
  };
}

export const __private__ = {
  deriveSignals,
  scoreJobCandidate,
  pickTopCandidates,
  overlapScore,
  MAPPING_HIGH_CONFIDENCE_THRESHOLD,
  MAPPING_MIN_CONFIDENCE_THRESHOLD,
};
