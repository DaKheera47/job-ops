import { logger } from "@infra/logger";

export function stripMarkdownCodeFences(content: string): string {
  return content
    .replace(/```(?:json|JSON)?\s*/g, "")
    .replace(/```/g, "")
    .trim();
}

export function parseJsonContent<T>(content: string, jobId?: string): T {
  let candidate = stripMarkdownCodeFences(content);

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
