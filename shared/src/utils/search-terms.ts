import { toStringOrNull } from "./type-conversion.js";

export const MAX_SEARCH_TERMS = 10;
export const MAX_SEARCH_TERM_LENGTH = 200;

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

export function normalizeSearchTerms(
  values: string[],
  options?: {
    maxTerms?: number;
    maxLength?: number;
  },
): string[] {
  const maxTerms = Math.max(1, options?.maxTerms ?? MAX_SEARCH_TERMS);
  const maxLength = Math.max(1, options?.maxLength ?? MAX_SEARCH_TERM_LENGTH);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const trimmed = value.trim().slice(0, maxLength);
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);

    if (out.length >= maxTerms) break;
  }

  return out;
}
