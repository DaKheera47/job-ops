import {
  bucketDurationMs,
  bucketFileSize,
  bucketQueryLength,
} from "@/lib/analytics";
export function getTextLengthBucket(value: string): string {
  return bucketQueryLength(value.length);
}

export function getFileType(file: File): "pdf" | "docx" | "json" | "unknown" {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    type.includes(
      "vnd.openxmlformats-officedocument.wordprocessingml.document",
    ) ||
    name.endsWith(".docx")
  ) {
    return "docx";
  }
  if (type.includes("json") || name.endsWith(".json")) return "json";
  return "unknown";
}

export function getFileSizeBucket(file: File): string {
  return bucketFileSize(file.size);
}

export function getDurationBucket(startedAt: number): string {
  return bucketDurationMs(Date.now() - startedAt);
}

export function getEndpointMode(
  value: string | null | undefined,
): "default" | "custom" | "blank" {
  if (value === undefined) return "default";
  if (value === null) return "blank";
  return value.trim() ? "custom" : "blank";
}

export function getModelSource(
  value: string | null | undefined,
): "default" | "custom" | "blank" {
  if (value === undefined || value === null) return "default";
  return value.trim() ? "custom" : "blank";
}

export function getHttpStatusBucket(error: unknown): string | undefined {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
  if (!Number.isFinite(status) || status <= 0) return undefined;
  if (status < 400) return "lt_400";
  if (status < 500) return `${Math.floor(status / 100)}xx`;
  return "5xx";
}

export function getErrorCategory(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
  if (status === 400 || status === 422) return "validation";
  if (status === 401 || status === 403) return "auth";
  if (status === 408) return "timeout";
  if (status === 409) return "conflict";
  if (status >= 500) return "server";

  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error ?? "");
  if (message.includes("timeout") || message.includes("timed out")) {
    return "timeout";
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "network";
  }
  if (message.includes("resume")) return "resume";
  if (message.includes("model") || message.includes("llm")) return "model";
  return "unknown";
}
