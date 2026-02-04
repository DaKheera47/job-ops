import { getNestedValue } from "./object";

export function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export function parseErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const payload = JSON.parse(trimmed) as unknown;
    const candidates: Array<unknown> = [
      getNestedValue(payload, ["error", "message"]),
      getNestedValue(payload, ["error", "error", "message"]),
      getNestedValue(payload, ["error"]),
      getNestedValue(payload, ["message"]),
      getNestedValue(payload, ["detail"]),
      getNestedValue(payload, ["msg"]),
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate.trim();
      }
    }

    if (typeof payload === "string" && payload.trim()) {
      return payload.trim();
    }
  } catch {
    // Not JSON
  }

  return trimmed;
}
