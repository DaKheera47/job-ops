import { logger } from "@infra/logger";

export function stripMarkdownCodeFences(content: string): string {
  // Remove only an enclosing Markdown fence, never backticks inside JSON values.
  return content
    .trim()
    .replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1")
    .trim();
}

export function parseJsonContent<T>(content: string, jobId?: string): T {
  let candidate = stripMarkdownCodeFences(content);

  // Prefer the complete value. Cropping to braces first corrupts valid arrays
  // and JSON strings, even when the provider already returned valid JSON.
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Some providers surround an object with prose; retain that fallback.
  }

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
