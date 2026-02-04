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
    console.error(
      `❌ [${jobId ?? "unknown"}] Failed to parse JSON:`,
      candidate.substring(0, 200),
    );
    throw new Error(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : "unknown"}`,
    );
  }
}
