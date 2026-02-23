import { ZodError } from "zod";
import type { RxResumeResolvedMode } from "../index";
import { parseV4ResumeData, safeParseV4ResumeData } from "./v4";
import { parseV5ResumeData, safeParseV5ResumeData } from "./v5";

export function parseResumeDataForMode(
  mode: RxResumeResolvedMode,
  data: unknown,
) {
  return mode === "v5" ? parseV5ResumeData(data) : parseV4ResumeData(data);
}

export function safeParseResumeDataForMode(
  mode: RxResumeResolvedMode,
  data: unknown,
) {
  return mode === "v5"
    ? safeParseV5ResumeData(data)
    : safeParseV4ResumeData(data);
}

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
