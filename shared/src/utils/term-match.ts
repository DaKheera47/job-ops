/**
 * Match a multi-word search term against an extractor's haystack (title +
 * description + tags joined into one lowercased blob).
 *
 * Replaces the original per-extractor "all tokens AND" heuristic, which was
 * too strict for in-memory boards (Himalayas / RemoteOK / Remotive /
 * WeWorkRemotely / WorkingNomads): a search term like
 *   "Senior Program Manager"
 * would silently drop every "Sr Program Mgr", "Program Manager II", or
 * "Lead Program Manager" listing because the literal "senior" token was
 * absent from the haystack.
 *
 * Rules (most specific first):
 *   1. Whole-phrase substring match → keep ("senior program manager"
 *      appears verbatim).
 *   2. Drop filler tokens that don't carry topical signal
 *      ("senior/junior/lead/staff/principal/director/head/sr/jr") and check
 *      whether every remaining token appears as a substring.  This is
 *      strict enough that "Program Manager" still requires both "program"
 *      AND "manager" in the text — we just stop forcing rank prefixes.
 *
 * Tokens shorter than 2 chars are skipped (avoids matching the literal
 * "of"/"a"/"&" that occasionally leak in from punctuated titles).
 */

const DEFAULT_FILLER_TOKENS = new Set<string>([
  "senior",
  "sr",
  "jr",
  "junior",
  "principal",
  "staff",
  "lead",
  "director",
  "head",
  "of",
  "the",
  "for",
  "and",
  "a",
  "an",
]);

export interface TermMatchOptions {
  /** When true (default), drop "senior/junior/…" before matching tokens. */
  readonly dropFillerTokens?: boolean;
  /** Custom filler set (overrides default when provided). */
  readonly fillerTokens?: ReadonlySet<string>;
}

export function termMatchesHaystack(
  haystack: string,
  searchTerm: string,
  options: TermMatchOptions = {},
): boolean {
  const term = searchTerm.toLowerCase().trim();
  if (!term) return true;

  const hay = haystack.toLowerCase();

  // 1. Whole-phrase wins fast.
  if (hay.includes(term)) return true;

  // 2. Token-by-token (excluding filler).
  const dropFiller = options.dropFillerTokens ?? true;
  const filler = options.fillerTokens ?? DEFAULT_FILLER_TOKENS;
  const tokens = term.split(/\s+/).filter((tok) => tok.length >= 2);
  const content = dropFiller
    ? tokens.filter((tok) => !filler.has(tok))
    : tokens;

  if (content.length === 0) return false;
  return content.every((tok) => hay.includes(tok));
}
