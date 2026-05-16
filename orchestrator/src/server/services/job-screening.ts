/**
 * Pre-scoring screening for discovered jobs (pure logic only).
 *
 * Two gates, both designed to run cheaply (regex / set lookup) BEFORE the LLM
 * scorer touches the queue:
 *
 *   1. Anti-domain — drop listings whose title clearly belongs to a career
 *      the candidate is not pursuing (healthcare, payroll, field sales,
 *      legal, ERP consulting, retail/service, recruiting, …).  These bleed
 *      in through broad remote-only boards (Himalayas, RemoteOK) which
 *      simply return everything on a popular keyword and overwhelm the
 *      scorer with obvious mismatches.
 *
 *   2. Resume signal — require at least one keyword from the candidate's
 *      design resume to appear in the job title or description.  This is a
 *      coarse positive filter: if the role doesn't touch a single thing
 *      the candidate writes about, the LLM is highly unlikely to score it.
 *
 * The screen is intentionally simple: regex + set intersection.  The LLM
 * scorer remains the source of truth for nuanced fit — we just stop wasting
 * its tokens on the obvious losers.
 *
 * This module has NO IO dependencies — the live resume loader lives in
 * resume-keywords-loader.ts so that pure tests don't drag the DB schema.
 */

// ---------- Anti-domain patterns ----------
// Each entry matches against the job TITLE alone (the most reliable signal —
// description noise frequently mentions tangential industries).
const ANTI_DOMAIN_PATTERNS: ReadonlyArray<{
  readonly name: string;
  readonly pattern: RegExp;
}> = [
  {
    name: "healthcare",
    pattern:
      /\b(medical|healthcare|clinical|nursing|nurse|patient care|physician|pharma(ceutical)?|pharmacy|dental|veterinary|epidemiolog|biostat|home infusion)\b/i,
  },
  {
    name: "billing_accounting",
    pattern:
      /\b(medical billing|revenue cycle|payroll(?! engineer)|tax preparer|tax accountant|bookkeep|cpa\b|accounts payable|accounts receivable|accounting clerk|financial controller|controller — accounting|invoicing|collections specialist)\b/i,
  },
  {
    name: "insurance",
    pattern:
      /\b(insurance underwriter|underwriter|claims adjuster|claims examiner|actuary|actuarial)\b/i,
  },
  {
    name: "field_sales",
    pattern:
      /\b(field sales|outside sales|inside sales|territory sales|sales executive|sales representative|sales rep|business development representative|sdr|bdr|account executive|aftermarket sales)\b/i,
  },
  {
    name: "erp_consultant",
    pattern:
      /\b(sap (consultant|s\/4hana|s4hana|fico|abap|hcm|mm)|oracle (ebs|hcm|consultant|fusion)|workday consultant|peoplesoft|netsuite consultant)\b/i,
  },
  {
    name: "real_estate",
    pattern:
      /\b(real estate|realtor|loan officer|mortgage|leasing agent|property manager)\b/i,
  },
  {
    name: "legal",
    pattern:
      /\b(paralegal|attorney|lawyer|litigation|legal counsel|law clerk|notary)\b/i,
  },
  {
    name: "retail_service",
    pattern:
      /\b(barista|cashier|waiter|waitress|hostess|delivery driver|warehouse associate|janitor|housekeep|chef|line cook|sous chef|bartender|valet|security guard|store associate)\b/i,
  },
  {
    name: "teaching",
    pattern:
      /\b(elementary teacher|preschool|kindergarten|substitute teacher|adjunct professor|adjunct instructor)\b/i,
  },
  {
    name: "recruiting",
    pattern:
      /\b(recruiter|sourcer|talent acquisition|talent partner|head of talent)\b/i,
  },
  {
    name: "creative_arts",
    pattern:
      /\b(graphic designer|illustrator|copywriter|content writer|video editor|photographer|art director|fashion stylist|makeup artist)\b/i,
  },
  {
    name: "fitness_wellness",
    pattern:
      /\b(personal trainer|yoga instructor|fitness coach|massage therapist|esthetician)\b/i,
  },
];

// ---------- Resume keyword extraction (pure) ----------

const KEYWORD_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "to", "with", "for",
  "on", "at", "by", "from", "as", "is", "are", "be", "been", "being",
  "was", "were", "has", "have", "had", "this", "that", "these", "those",
  "it", "its", "we", "they", "you", "our", "their", "your", "my", "his",
  "her", "i",
  "good", "great", "strong", "excellent", "high", "low", "best",
  "robust", "deep", "broad", "wide",
  "experience", "experienced", "experiences", "years", "year",
  "ability", "abilities", "skill", "skills", "knowledge", "work",
  "working", "team", "teams", "company", "companies", "role", "roles",
  "job", "jobs", "position", "positions", "opportunity",
  "responsible", "responsibility", "responsibilities", "include", "includes",
  "including", "improved", "improvement", "improvements", "ensure",
  "ensured", "delivered", "delivering", "demonstrated", "across", "within",
  "over", "more", "than", "into", "between", "through", "via",
]);

const RESUME_KEYWORD_MIN_LENGTH = 3;

function stripHtml(value: string): string {
  return value
    .replace(/<\/(p|div|li|br|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  // Preserve +, #, ., / inside tech terms ("c++", "c#", "iso 26262", "ci/cd")
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function isMeaningfulKeyword(token: string): boolean {
  if (token.length < RESUME_KEYWORD_MIN_LENGTH) return false;
  if (KEYWORD_STOPWORDS.has(token)) return false;
  if (/^\d+$/.test(token)) return false;
  return true;
}

export interface ResumeKeywords {
  /**
   * Lowercased, deduplicated tokens >= 3 chars with stopwords/numbers
   * removed.  Used as a set for substring containment checks.
   */
  readonly tokens: ReadonlySet<string>;
  /**
   * Lowercased language names from the resume's `sections.languages`
   * (e.g. {"english", "russian"}).  Used by the language-gate to skip
   * postings that hard-require a language the candidate doesn't list.
   */
  readonly candidateLanguages: ReadonlySet<string>;
  /** Length of the source text the tokens were derived from. */
  readonly sourceLength: number;
}

export const EMPTY_RESUME_KEYWORDS: ResumeKeywords = {
  tokens: new Set(),
  candidateLanguages: new Set(),
  sourceLength: 0,
};

function collectStringValues(node: unknown, out: string[]): void {
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectStringValues(item, out);
  }
}

/**
 * Extract the candidate's keyword set from a resume JSON document. The JSON
 * shape is the resume-data document stored in `design_resume_documents` (a
 * mix of `basics`, `summary`, and `sections.{skills,experience,projects,
 * certifications,education}`).
 *
 * Designed to be tolerant of missing/malformed fields: every walk is wrapped
 * in `typeof` checks so an empty or partial resume just yields fewer tokens.
 */
export function extractKeywordsFromResumeJson(
  resumeJson: unknown,
): ResumeKeywords {
  if (!resumeJson || typeof resumeJson !== "object") {
    return EMPTY_RESUME_KEYWORDS;
  }
  const resume = resumeJson as Record<string, unknown>;

  const textChunks: string[] = [];

  const pushString = (value: unknown): void => {
    if (typeof value === "string" && value.trim().length > 0) {
      textChunks.push(value);
    }
  };
  const pushHtml = (value: unknown): void => {
    if (typeof value === "string" && value.trim().length > 0) {
      textChunks.push(stripHtml(value));
    }
  };

  const basics = (resume.basics as Record<string, unknown> | undefined) ?? {};
  pushString(basics.headline);

  const summary = (resume.summary as Record<string, unknown> | undefined) ?? {};
  pushHtml(summary.content);

  const sections =
    (resume.sections as Record<string, unknown> | undefined) ?? {};

  const sectionItems = (key: string): unknown[] => {
    const sec = sections[key] as Record<string, unknown> | undefined;
    return Array.isArray(sec?.items) ? (sec.items as unknown[]) : [];
  };

  for (const item of sectionItems("skills")) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    pushString(obj.name);
    const kws: string[] = [];
    collectStringValues(obj.keywords, kws);
    for (const kw of kws) pushString(kw);
  }

  for (const item of sectionItems("experience")) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    pushString(obj.position);
    pushHtml(obj.summary);
    pushHtml(obj.description);
  }

  for (const item of sectionItems("certifications")) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    pushString(obj.name);
    pushString(obj.issuer);
  }

  for (const item of sectionItems("projects")) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    pushString(obj.name);
    pushHtml(obj.description);
    const kws: string[] = [];
    collectStringValues(obj.keywords, kws);
    for (const kw of kws) pushString(kw);
  }

  for (const item of sectionItems("education")) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    pushString(obj.studyType);
    pushString(obj.area);
    pushString(obj.institution);
  }

  // Languages: live in their own section.  Resume schemas inconsistently use
  // `language` (reactive-resume) vs `name` (JSON-Resume) — accept both.
  const candidateLanguages = new Set<string>();
  for (const item of sectionItems("languages")) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const raw =
      typeof obj.language === "string"
        ? obj.language
        : typeof obj.name === "string"
          ? obj.name
          : null;
    if (!raw) continue;
    const normalized = raw.toLowerCase().trim();
    if (normalized) candidateLanguages.add(normalized);
  }

  const fullText = textChunks.join(" ");
  const tokens = new Set<string>();
  for (const tok of tokenize(fullText)) {
    if (isMeaningfulKeyword(tok)) tokens.add(tok);
  }
  return { tokens, candidateLanguages, sourceLength: fullText.length };
}

// ---------- Language gate ----------
//
// Catalog of human languages we screen for.  Each entry pairs a canonical
// lowercase name (matched against the candidate's resume language list) with
// a regex that fires ONLY on hard requirements in the job text:
//   - "fluent in <lang>" / "<lang> fluency"
//   - "native <lang> speaker"
//   - "<lang> required" / "<lang>-speaking position"
//   - "must speak <lang>"
//
// Deliberately strict — "nice-to-have" or "knowledge of <lang>" never fires.

interface LanguageRequirementPattern {
  readonly name: string; // canonical lowercase
  readonly pattern: RegExp; // detects hard requirement in job text
}

function buildLanguagePattern(...labels: string[]): RegExp {
  const alt = labels
    .map((l) => l.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"))
    .join("|");
  // Use \s* between the language token and the modifier so "Native\nPolish"
  // still matches. The hard-requirement modifiers come either side.
  const lang = `(?:${alt})`;
  const lhs = `\\b(?:fluent\\s+in\\s+|native\\s+|fluency\\s+in\\s+|must\\s+speak\\s+|proficient\\s+in\\s+)${lang}\\b`;
  const rhs = `\\b${lang}\\s+(?:fluent|fluency|native|required|mandatory|mother\\s+tongue|speaker|speaking|level|c1|c2)\\b`;
  const adjective = `\\b${lang}[-\\s](?:speaking|native|fluent)\\s+(?:position|role|candidate|speaker)\\b`;
  const phrase = `\\bonly\\s+(?:in\\s+)?${lang}\\b`;
  return new RegExp(`(?:${lhs}|${rhs}|${adjective}|${phrase})`, "i");
}

const LANGUAGE_REQUIREMENT_PATTERNS: ReadonlyArray<LanguageRequirementPattern> =
  [
    { name: "polish", pattern: buildLanguagePattern("polish", "polski") },
    {
      name: "german",
      pattern: buildLanguagePattern("german", "deutsch", "muttersprache"),
    },
    { name: "french", pattern: buildLanguagePattern("french", "français") },
    { name: "spanish", pattern: buildLanguagePattern("spanish", "español") },
    { name: "italian", pattern: buildLanguagePattern("italian", "italiano") },
    {
      name: "dutch",
      pattern: buildLanguagePattern("dutch", "nederlands", "flemish"),
    },
    { name: "portuguese", pattern: buildLanguagePattern("portuguese") },
    { name: "czech", pattern: buildLanguagePattern("czech", "čeština") },
    { name: "hungarian", pattern: buildLanguagePattern("hungarian", "magyar") },
    { name: "swedish", pattern: buildLanguagePattern("swedish", "svenska") },
    { name: "norwegian", pattern: buildLanguagePattern("norwegian", "norsk") },
    { name: "danish", pattern: buildLanguagePattern("danish", "dansk") },
    { name: "finnish", pattern: buildLanguagePattern("finnish", "suomi") },
    { name: "romanian", pattern: buildLanguagePattern("romanian", "română") },
    { name: "greek", pattern: buildLanguagePattern("greek") },
    { name: "turkish", pattern: buildLanguagePattern("turkish") },
    { name: "ukrainian", pattern: buildLanguagePattern("ukrainian") },
    { name: "russian", pattern: buildLanguagePattern("russian") },
    { name: "japanese", pattern: buildLanguagePattern("japanese") },
    { name: "korean", pattern: buildLanguagePattern("korean") },
    {
      name: "chinese",
      pattern: buildLanguagePattern("chinese", "mandarin", "cantonese"),
    },
    { name: "arabic", pattern: buildLanguagePattern("arabic") },
    { name: "hebrew", pattern: buildLanguagePattern("hebrew") },
    { name: "thai", pattern: buildLanguagePattern("thai") },
    { name: "vietnamese", pattern: buildLanguagePattern("vietnamese") },
  ];

// ---------- Screening ----------

export type ScreenReason =
  | { readonly kind: "anti_domain"; readonly domain: string }
  | { readonly kind: "language_required"; readonly language: string }
  | { readonly kind: "no_resume_signal" };

export interface ScreeningInput {
  readonly title: string;
  readonly jobDescription?: string | null;
}

export type ScreenResult =
  | { readonly skip: false }
  | { readonly skip: true; readonly reason: ScreenReason };

export function screenJob(
  job: ScreeningInput,
  resumeKeywords: ResumeKeywords,
): ScreenResult {
  const title = job.title ?? "";
  const fullText = `${title} ${job.jobDescription ?? ""}`;

  for (const { name, pattern } of ANTI_DOMAIN_PATTERNS) {
    if (pattern.test(title)) {
      return { skip: true, reason: { kind: "anti_domain", domain: name } };
    }
  }

  // Language gate — only fires when the candidate's resume lists at least
  // one language (otherwise we have no negative signal to act on).
  if (resumeKeywords.candidateLanguages.size > 0) {
    for (const { name, pattern } of LANGUAGE_REQUIREMENT_PATTERNS) {
      if (resumeKeywords.candidateLanguages.has(name)) continue;
      if (pattern.test(fullText)) {
        return {
          skip: true,
          reason: { kind: "language_required", language: name },
        };
      }
    }
  }

  if (resumeKeywords.tokens.size === 0) return { skip: false };

  const haystack = fullText.toLowerCase();
  for (const kw of resumeKeywords.tokens) {
    if (haystack.includes(kw)) return { skip: false };
  }

  return { skip: true, reason: { kind: "no_resume_signal" } };
}

export function formatSkipReason(reason: ScreenReason): string {
  if (reason.kind === "anti_domain") {
    return `Auto-skipped: ${reason.domain.replace(/_/g, " ")} role doesn't match candidate resume`;
  }
  if (reason.kind === "language_required") {
    const label =
      reason.language.charAt(0).toUpperCase() + reason.language.slice(1);
    return `Auto-skipped: requires ${label} language not in candidate resume`;
  }
  return "Auto-skipped: no resume-keyword overlap in title or description";
}

/** Exposed for tests / observability. */
export const ANTI_DOMAIN_NAMES: readonly string[] = ANTI_DOMAIN_PATTERNS.map(
  (entry) => entry.name,
);
