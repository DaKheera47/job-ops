import { ZodError } from "zod";

export { parseV5ResumeData, safeParseV5ResumeData } from "./v5";

export function getResumeSchemaValidationMessage(error: unknown): string {
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    if (!issue) return "Resume schema validation failed.";
    const path = issue.path.map(String).join(".");
    return path
      ? `Resume schema validation failed at "${path}": ${issue.message}`
      : `Resume schema validation failed: ${issue.message}`;
  }
  return error instanceof Error
    ? error.message
    : "Resume schema validation failed.";
}
