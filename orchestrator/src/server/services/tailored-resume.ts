import { createHash } from "node:crypto";
import type {
  TailoredResumeArtifact,
  TailoredResumeItem,
} from "@shared/types";
import { stripHtmlTags } from "@shared/utils/string";

type RecordLike = Record<string, unknown>;

export interface TailoredSkill {
  name: string;
  keywords: string[];
}

export interface FullTailoredData {
  headline: string;
  summary: string;
  skills: TailoredSkill[];
  experience: TailoredResumeItem[];
  projects: TailoredResumeItem[];
}

export interface TailoringSourceItem extends RecordLike {
  id: string;
  description: string;
}

export interface TailoringSource {
  basics: { headline: string; summary: string };
  summaryVisible: boolean;
  skillsVisible: boolean;
  skills: Array<{
    name: string;
    proficiency: string;
    level: number;
    keywords: string[];
    visible: boolean;
  }>;
  experienceVisible: boolean;
  experience: TailoringSourceItem[];
  projectsVisible: boolean;
  projects: TailoringSourceItem[];
}

const MAX_ARTIFACT_CHARS = 250_000;
const MAX_HEADLINE_CHARS = 200;
const MAX_SUMMARY_CHARS = 4_000;
const MAX_SKILLS = 50;
const MAX_SKILL_NAME_CHARS = 100;
const MAX_KEYWORDS_PER_SKILL = 50;
const MAX_KEYWORD_CHARS = 100;
const MAX_BULLETS_PER_ITEM = 20;
const MAX_BULLET_CHARS = 1_000;
const MAX_SOURCE_TEXT_CHARS = 20_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const NUMERICAL_TOKEN_PATTERN = /\d+(?:[.,]\d+)*%?/g;

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function plainText(value: unknown, max = MAX_SOURCE_TEXT_CHARS): string {
  return stripHtmlTags(text(value)).slice(0, max).trim();
}

function firstPlainText(max: number, ...values: unknown[]): string {
  for (const value of values) {
    const result = plainText(value, max);
    if (result) return result;
  }
  return "";
}

function visible(record: RecordLike | null): boolean {
  if (!record) return true;
  if (typeof record.hidden === "boolean") return !record.hidden;
  if (typeof record.visible === "boolean") return record.visible;
  return true;
}

function uniqueItems(items: TailoringSourceItem[]): TailoringSourceItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

/** Isolates Reactive Resume v5 and legacy aliases at the tailoring boundary. */
export function extractTailoringSource(resume: unknown): TailoringSource {
  const root = asRecord(resume) ?? {};
  const basics = asRecord(root.basics) ?? {};
  const rootSummary = asRecord(root.summary);
  const sections = asRecord(root.sections) ?? {};
  const sectionSummary = asRecord(sections.summary);
  const skillsSection = asRecord(sections.skills);
  const experienceSection = asRecord(sections.experience);
  const projectsSection = asRecord(sections.projects);

  const skills = asArray(skillsSection?.items).flatMap((raw) => {
    const item = asRecord(raw);
    if (!item) return [];
    return [
      {
        name: plainText(item.name, MAX_SKILL_NAME_CHARS),
        proficiency: firstPlainText(500, item.proficiency, item.description),
        level:
          typeof item.level === "number" && Number.isFinite(item.level)
            ? item.level
            : 0,
        keywords: asArray(item.keywords)
          .map((keyword) => plainText(keyword, MAX_KEYWORD_CHARS))
          .filter(Boolean),
        visible: visible(item),
      },
    ];
  });

  const experience = uniqueItems(
    asArray(experienceSection?.items).flatMap((raw) => {
      const item = asRecord(raw);
      const id = text(item?.id).trim();
      if (!item || !id) return [];
      const roles = asArray(item.roles).flatMap((rawRole) => {
        const role = asRecord(rawRole);
        if (!role) return [];
        return [
          {
            position: plainText(role.position, 500),
            period: firstPlainText(500, role.period, role.date),
            description: firstPlainText(
              MAX_SOURCE_TEXT_CHARS,
              role.description,
              role.summary,
            ),
          },
        ];
      });
      return [
        {
          id,
          company: plainText(item.company, 500),
          position: plainText(item.position, 500),
          location: plainText(item.location, 500),
          period: firstPlainText(500, item.period, item.date),
          description: firstPlainText(
            MAX_SOURCE_TEXT_CHARS,
            item.description,
            item.summary,
          ),
          roles,
          visible: visible(item),
        },
      ];
    }),
  );

  const projects = uniqueItems(
    asArray(projectsSection?.items).flatMap((raw) => {
      const item = asRecord(raw);
      const id = text(item?.id).trim();
      if (!item || !id) return [];
      return [
        {
          id,
          name: plainText(item.name, 500),
          period: firstPlainText(500, item.period, item.date),
          description: firstPlainText(
            MAX_SOURCE_TEXT_CHARS,
            item.description,
            item.summary,
          ),
          keywords: asArray(item.keywords)
            .map((keyword) => plainText(keyword, MAX_KEYWORD_CHARS))
            .filter(Boolean),
          visible: visible(item),
        },
      ];
    }),
  );

  return {
    basics: {
      headline: firstPlainText(
        MAX_HEADLINE_CHARS,
        basics.headline,
        basics.label,
      ),
      summary: firstPlainText(
        MAX_SOURCE_TEXT_CHARS,
        basics.summary,
        rootSummary?.content,
        sectionSummary?.content,
      ),
    },
    summaryVisible: visible(rootSummary ?? sectionSummary),
    skillsVisible: visible(skillsSection),
    skills,
    experienceVisible: visible(experienceSection),
    experience,
    projectsVisible: visible(projectsSection),
    projects,
  };
}

function sanitizeOutputText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return stripHtmlTags(value.replace(/\*\*/g, ""))
    .replace(/\p{Cc}/gu, "")
    .slice(0, max)
    .trim();
}

function numericalTokens(value: string): Set<string> {
  return new Set(value.match(NUMERICAL_TOKEN_PATTERN) ?? []);
}

function sourceEvidence(item: TailoringSourceItem): string {
  const { id: _id, visible: _visible, ...evidence } = item;
  return JSON.stringify(evidence);
}

function validateRewrites(args: {
  value: unknown;
  source: TailoringSourceItem[];
  rejectInvalidNumbers?: boolean;
}): { data?: TailoredResumeItem[]; error?: string } {
  if (!Array.isArray(args.value)) return { error: "must be an array" };

  const sourceById = new Map(args.source.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const data: TailoredResumeItem[] = [];

  for (const raw of args.value) {
    const item = asRecord(raw);
    const id = text(item?.id).trim();
    if (!item || !id || !Array.isArray(item.bullets)) {
      return { error: "contains a malformed item" };
    }
    if (seen.has(id)) return { error: `contains duplicate id ${id}` };
    seen.add(id);

    const source = sourceById.get(id);
    if (!source) return { error: `contains unknown id ${id}` };
    const allowedNumbers = numericalTokens(sourceEvidence(source));
    const bullets: string[] = [];

    for (const rawBullet of item.bullets) {
      if (typeof rawBullet !== "string") {
        return { error: `contains a non-text bullet for ${id}` };
      }
      const bullet = sanitizeOutputText(rawBullet, MAX_BULLET_CHARS);
      if (!bullet) continue;
      const introducesNumber = [...numericalTokens(bullet)].some(
        (token) => !allowedNumbers.has(token),
      );
      if (introducesNumber) {
        if (args.rejectInvalidNumbers) {
          return { error: `contains an unsupported number for ${id}` };
        }
        continue;
      }
      if (bullets.length < MAX_BULLETS_PER_ITEM) bullets.push(bullet);
    }

    if (bullets.length > 0) data.push({ id, bullets });
  }

  return { data };
}

export function validateTailoringData(
  value: unknown,
  resume: unknown,
): { data?: FullTailoredData; error?: string } {
  const raw = asRecord(value);
  if (!raw) return { error: "AI response is not an object" };

  const headline = sanitizeOutputText(raw.headline, MAX_HEADLINE_CHARS);
  const summary = sanitizeOutputText(raw.summary, MAX_SUMMARY_CHARS);
  if (!headline || !summary || !Array.isArray(raw.skills)) {
    return { error: "AI response is missing required tailoring fields" };
  }

  const skills: TailoredSkill[] = [];
  for (const rawSkill of raw.skills.slice(0, MAX_SKILLS)) {
    const skill = asRecord(rawSkill);
    if (!skill || !Array.isArray(skill.keywords)) {
      return { error: "AI response contains a malformed skill" };
    }
    const name = sanitizeOutputText(skill.name, MAX_SKILL_NAME_CHARS);
    if (!name) return { error: "AI response contains an unnamed skill" };
    skills.push({
      name,
      keywords: skill.keywords
        .slice(0, MAX_KEYWORDS_PER_SKILL)
        .map((keyword) => sanitizeOutputText(keyword, MAX_KEYWORD_CHARS))
        .filter(Boolean),
    });
  }

  const source = extractTailoringSource(resume);
  const experience = validateRewrites({
    value: raw.experience,
    source: source.experience,
  });
  if (experience.error) return { error: `Experience ${experience.error}` };
  const projects = validateRewrites({
    value: raw.projects,
    source: source.projects,
  });
  if (projects.error) return { error: `Projects ${projects.error}` };
  if (source.experience.length > 0 && experience.data?.length === 0) {
    return { error: "AI response contains no valid source-linked experience" };
  }

  return {
    data: {
      headline,
      summary,
      skills,
      experience: experience.data ?? [],
      projects: projects.data ?? [],
    },
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createTailoringSourceHash(resume: unknown): string {
  return sha256(JSON.stringify(extractTailoringSource(resume)));
}

export function createJobDescriptionHash(jobDescription: string): string {
  return sha256(stripHtmlTags(jobDescription));
}

export function createTailoredResumeArtifact(
  data: FullTailoredData,
  resume: unknown,
  jobDescription: string,
  generatedAt = new Date().toISOString(),
): TailoredResumeArtifact {
  return {
    version: 1,
    sourceHash: createTailoringSourceHash(resume),
    jobDescriptionHash: createJobDescriptionHash(jobDescription),
    generatedAt,
    experience: data.experience,
    projects: data.projects,
  };
}

export function parseValidTailoredResumeArtifact(
  value: unknown,
  resume: unknown,
  jobDescription: string,
): TailoredResumeArtifact | null {
  if (!value) return null;
  if (typeof value === "string" && value.length > MAX_ARTIFACT_CHARS) return null;

  let raw: RecordLike | null;
  try {
    raw = asRecord(typeof value === "string" ? JSON.parse(value) : value);
  } catch {
    return null;
  }
  if (
    !raw ||
    raw.version !== 1 ||
    !SHA256_PATTERN.test(text(raw.sourceHash)) ||
    !SHA256_PATTERN.test(text(raw.jobDescriptionHash)) ||
    Number.isNaN(Date.parse(text(raw.generatedAt))) ||
    raw.sourceHash !== createTailoringSourceHash(resume) ||
    raw.jobDescriptionHash !== createJobDescriptionHash(jobDescription)
  ) {
    return null;
  }

  const source = extractTailoringSource(resume);
  const experience = validateRewrites({
    value: raw.experience,
    source: source.experience,
    rejectInvalidNumbers: true,
  });
  const projects = validateRewrites({
    value: raw.projects,
    source: source.projects,
    rejectInvalidNumbers: true,
  });
  if (
    experience.error ||
    projects.error ||
    (source.experience.length > 0 && experience.data?.length === 0)
  ) {
    return null;
  }

  return {
    version: 1,
    sourceHash: text(raw.sourceHash),
    jobDescriptionHash: text(raw.jobDescriptionHash),
    generatedAt: text(raw.generatedAt),
    experience: experience.data ?? [],
    projects: projects.data ?? [],
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderTailoredBullets(bullets: string[]): string {
  return `<ul>${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`;
}

export function applyTailoredResumeArtifact(
  resumeData: RecordLike,
  artifact: TailoredResumeArtifact,
): void {
  const sections = asRecord(resumeData.sections);
  for (const [sectionName, rewrites] of [
    ["experience", artifact.experience],
    ["projects", artifact.projects],
  ] as const) {
    const section = asRecord(sections?.[sectionName]);
    const byId = new Map(rewrites.map((item) => [item.id, item.bullets]));
    for (const rawItem of asArray(section?.items)) {
      const item = asRecord(rawItem);
      const bullets = byId.get(text(item?.id));
      if (item && bullets) item.description = renderTailoredBullets(bullets);
    }
  }
}
