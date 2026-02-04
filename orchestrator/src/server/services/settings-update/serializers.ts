import { normalizeEnvInput } from "@server/services/envSettings";

export function toNormalizedStringOrNull(
  value: string | null | undefined,
): string | null {
  return normalizeEnvInput(value);
}

export function toStringOrNull(
  value: number | null | undefined,
): string | null {
  return value !== null && value !== undefined ? String(value) : null;
}

export function toJsonOrNull<T>(value: T | null | undefined): string | null {
  return value !== null && value !== undefined ? JSON.stringify(value) : null;
}

export function toBitBoolOrNull(
  value: boolean | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  return value ? "1" : "0";
}
