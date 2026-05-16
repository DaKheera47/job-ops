/**
 * Parser for top-level "Who is hiring?" comments on Hacker News.
 *
 * HN posts are unstructured prose, but the long-running convention for the
 * monthly hiring thread is a pipe-separated header on the first line, e.g.
 *
 *     Anthropic | San Francisco, CA / Remote (US, EU) | Software Engineer
 *     | full-time | $$$ | jobs@anthropic.com
 *
 *     Description text follows...
 *
 * We extract company, role, and remote/location signal from the header and
 * return null when the comment doesn't look like a job listing.  Conservative
 * by design — better to miss a few non-conforming posts than ingest noise.
 */

export interface ParsedHnJob {
  readonly company: string;
  readonly title: string;
  readonly location: string;
  readonly isRemote: boolean;
  readonly description: string;
  /** Trimmed plain-text from the comment, no HTML. */
  readonly fullText: string;
}

const HEADER_DELIMITER_RE = /\s+[|·–—-]\s+/;
const ROLE_HINT_RE =
  /\b(engineer|developer|programmer|architect|designer|scientist|manager|director|lead|head|founder|cto|cpo|vp|recruiter|analyst|consultant|specialist|coordinator|admin|administrator|operator|writer|copywriter|marketer|sre|devops|qa|tester|researcher|intern|trader|product|principal|staff|senior|junior|sde|swe|pm|tpm|epm|ml|ai|data|frontend|backend|fullstack|full-stack|mobile|ios|android|web)\b/i;

const REMOTE_RE =
  /\b(remote|anywhere|distributed|wfh|work[ -]from[ -]home|fully[ -]remote)\b/i;
const ONSITE_ONLY_RE = /\b(onsite\s*only|onsite[/-]only|no remote)\b/i;
// Skip "INTERN-only" listings — Olga is not an intern candidate.
const INTERN_ONLY_RE =
  /\b(intern(ship)?(\s*only)?|summer intern|graduate program)\b/i;
// Skip "SEEKING FREELANCER" / "SEEKING WORK" posts — HN allows freelance
// requests inside the hiring thread, but those are gig listings, not jobs.
const FREELANCER_TAG_RE = /\bseeking (freelancer|work|contract)\b/i;

function decodeEntities(text: string): string {
  return text
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/gi, "/")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

export function stripHnHtml(raw: string): string {
  return decodeEntities(
    raw
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pickHeader(plain: string): string {
  const first = plain.split(/\n\s*\n/, 1)[0] ?? "";
  // Some comments cram everything in one giant paragraph — cap header
  // detection at 400 chars to avoid swallowing the whole description.
  return first.slice(0, 400).trim();
}

function detectLocationField(parts: string[]): string {
  // Pick the part that mentions a city/country/remote — usually parts[1]
  // but sometimes the first piece is the role and company is elsewhere.
  // Heuristic: prefer the part containing REMOTE_RE or a comma (city, state).
  const explicit = parts.find(
    (p) => REMOTE_RE.test(p) || /,\s+[A-Z]{2}\b/.test(p),
  );
  if (explicit) return explicit.trim();
  // Fall back to second part if at least 2 exist; else first.
  if (parts.length >= 2) return parts[1].trim();
  return "";
}

function pickRolePart(parts: string[]): string | null {
  const roleParts = parts.filter((p) => ROLE_HINT_RE.test(p));
  if (roleParts.length === 0) return null;
  // If multiple roles are listed, join the first two for the title.
  return roleParts.slice(0, 2).join(" / ");
}

/**
 * Parse a single HN "Who is hiring?" top-level comment.  Returns null when
 * the post does not match the conventional `company | location | role`
 * format — we'd rather lose a non-conforming post than ingest free-form
 * prose that confuses downstream filtering.
 */
export function parseHnComment(commentHtml: string): ParsedHnJob | null {
  const plain = stripHnHtml(commentHtml);
  if (!plain) return null;

  const header = pickHeader(plain);
  if (!header) return null;

  // Drop obvious anti-targets (intern-only, on-site only, freelancer ads)
  // early so we don't even surface them upstream.
  if (INTERN_ONLY_RE.test(header)) return null;
  if (FREELANCER_TAG_RE.test(header)) return null;

  const parts = header.split(HEADER_DELIMITER_RE).map((p) => p.trim());
  if (parts.length < 2) return null;

  const company = parts[0].trim();
  if (!company || company.length > 120) return null;

  const role = pickRolePart(parts);
  if (!role) return null;

  const locationField = detectLocationField(parts);
  const isRemoteRaw = REMOTE_RE.test(header);
  const isOnsiteOnly = ONSITE_ONLY_RE.test(header);
  const isRemote = isRemoteRaw && !isOnsiteOnly;

  return {
    company,
    title: role,
    location: locationField || (isRemote ? "Remote" : ""),
    isRemote,
    description: plain,
    fullText: plain,
  };
}
