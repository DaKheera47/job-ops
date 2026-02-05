import { logger } from "@infra/logger";

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
    logger.error("Failed to parse LLM JSON content", {
      jobId: jobId ?? "unknown",
      sample: candidate.substring(0, 200),
    });
    throw new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
}
