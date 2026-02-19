import { toStringOrNull } from "./type-conversion.js";

export function detectSearchTermDelimiter(value: string): string {
  if (value.includes("|")) return "|";
  if (value.includes("\n")) return "\n";
  return ",";
}

export function parseSearchTerms(
  raw: string | undefined,
  fallbackTerm: string,
): string[] {
  if (!raw || raw.trim().length === 0) return [fallbackTerm];

  const trimmed = raw.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        const terms = parsed
          .map((value) => toStringOrNull(value))
          .filter((value): value is string => value !== null);
        if (terms.length > 0) return terms;
      }
    } catch {
      // Fall through to delimiter parsing.
    }
  }

  const delimiter = detectSearchTermDelimiter(trimmed);
  const terms = trimmed
    .split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  return terms.length > 0 ? terms : [fallbackTerm];
}
