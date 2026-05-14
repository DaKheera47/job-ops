/**
 * Centralised reader for candidate identity (name, email, phone, location).
 *
 * Single source of truth: the design-resume document the user uploaded at
 * registration.  Anything that needs to display or transmit candidate-facing
 * identity (PDF filenames, Telegram captions, Smart Apply form pre-fills,
 * cover-letter sender block) should call this — not pull random fields from
 * Telegram's user info or hard-coded strings.
 */

import { logger } from "@infra/logger";
import { getLatestDesignResumeDocument } from "../repositories/design-resume";

export interface CandidateBasics {
  /** Full name as the user wrote it on their resume, e.g. "Olga Fadeeva". */
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  headline: string | null;
}

const EMPTY: CandidateBasics = {
  name: null,
  email: null,
  phone: null,
  location: null,
  headline: null,
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

let cache: { value: CandidateBasics; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

function readCache(): CandidateBasics | null {
  if (!cache) return null;
  if (cache.expiresAt < Date.now()) {
    cache = null;
    return null;
  }
  return cache.value;
}

function writeCache(value: CandidateBasics): void {
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
}

/** Invalidate the cache (call after the user edits their design resume). */
export function clearCandidateBasicsCache(): void {
  cache = null;
}

export async function getCandidateBasics(): Promise<CandidateBasics> {
  const cached = readCache();
  if (cached) return cached;

  try {
    const doc = await getLatestDesignResumeDocument();
    if (!doc) {
      writeCache(EMPTY);
      return EMPTY;
    }

    const raw = (doc.resumeJson as { basics?: Record<string, unknown> } | null)
      ?.basics;
    if (!raw || typeof raw !== "object") {
      writeCache(EMPTY);
      return EMPTY;
    }

    const value: CandidateBasics = {
      name: asTrimmedString(raw.name),
      email: asTrimmedString(raw.email),
      phone: asTrimmedString(raw.phone),
      location: asTrimmedString(raw.location),
      headline: asTrimmedString(raw.headline),
    };
    writeCache(value);
    return value;
  } catch (err) {
    logger.warn("Failed to read candidate basics from design resume", {
      error: err instanceof Error ? err.message : String(err),
    });
    return EMPTY;
  }
}

/**
 * Convenience: derive a "FirstName LastName" tuple from the candidate's
 * resume `basics.name` field.  Falls back to (null, null) when the name is
 * missing.  Used by form pre-fillers and filename builders.
 */
export async function getCandidateNameParts(): Promise<{
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
}> {
  const basics = await getCandidateBasics();
  const fullName = basics.name;
  if (!fullName) return { firstName: null, lastName: null, fullName: null };

  const parts = fullName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null, fullName };
  if (parts.length === 1) return { firstName: parts[0], lastName: null, fullName };
  // Treat last token as last name; everything before joins as first name.
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts[parts.length - 1],
    fullName,
  };
}
