import { createId } from "@paralleldrive/cuid2";
import type { ResumeProjectCatalogItem, RxResumeMode } from "@shared/types";
import { stripHtmlTags } from "@shared/utils/string";
import {
  getResumeSchemaValidationMessage,
  safeParseResumeDataForMode,
} from "./schema";

type RecordLike = Record<string, unknown>;

export type TailoredSkillsInput =
  | Array<{ name: string; keywords: string[] }>
  | string
  | null
  | undefined;

export type TailorChunkInput = {
  headline?: string | null;
  summary?: string | null;
  skills?: TailoredSkillsInput;
};

export type ResumeProjectSelectionItem = ResumeProjectCatalogItem & {
  summaryText: string;
};

export function cloneResumeData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data)) as T;
}

export function validateAndParseResumeDataForMode(
  mode: RxResumeMode,
  data: unknown,
):
  | { ok: true; mode: RxResumeMode; data: RecordLike }
  | { ok: false; mode: RxResumeMode; message: string } {
  const result = safeParseResumeDataForMode(mode, data);
  if (!result.success) {
    return {
      ok: false,
      mode,
      message: getResumeSchemaValidationMessage(result.error),
    };
  }
  if (
    !result.data ||
    typeof result.data !== "object" ||
    Array.isArray(result.data)
  ) {
    return {
      ok: false,
      mode,
      message:
        "Resume schema validation failed: root payload must be an object.",
    };
  }
  return { ok: true, mode, data: result.data as RecordLike };
}

export function inferRxResumeModeFromData(data: unknown): RxResumeMode | null {
  const v5 = safeParseResumeDataForMode("v5", data);
  if (v5.success) return "v5";
  const v4 = safeParseResumeDataForMode("v4", data);
  if (v4.success) return "v4";
  return null;
}

function asRecord(value: unknown): RecordLike | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function parseTailoredSkills(
  skills: TailoredSkillsInput,
): Array<RecordLike> | null {
  if (!skills) return null;
  const parsed = Array.isArray(skills)
    ? skills
    : typeof skills === "string"
      ? (JSON.parse(skills) as unknown)
      : null;
  if (!Array.isArray(parsed)) return null;
  return parsed.filter(
    (item) => item && typeof item === "object",
  ) as RecordLike[];
}

export function applyTailoredHeadline(
  mode: RxResumeMode,
  resumeData: RecordLike,
  headline?: string | null,
): void {
  if (!headline) return;
  const basics = asRecord(resumeData.basics);
  if (!basics) return;
  basics.headline = headline;
  // Preserve current behavior for legacy consumers/templates that use label.
  basics.label = headline;
  if (mode === "v5") return;
}

export function applyTailoredSummary(
  mode: RxResumeMode,
  resumeData: RecordLike,
  summary?: string | null,
): void {
  if (!summary) return;
  if (mode === "v5") {
    const topSummary = asRecord(resumeData.summary);
    if (topSummary) {
      if (
        typeof topSummary.content === "string" ||
        topSummary.content === undefined
      ) {
        topSummary.content = summary;
        return;
      }
      if (
        typeof topSummary.value === "string" ||
        topSummary.value === undefined
      ) {
        topSummary.value = summary;
        return;
      }
    }
  }

  const sections = asRecord(resumeData.sections);
  const summarySection = asRecord(sections?.summary);
  if (summarySection) {
    summarySection.content = summary;
    return;
  }

  const basics = asRecord(resumeData.basics);
  if (basics) basics.summary = summary;
}

function sanitizeV4SkillsSection(resumeData: RecordLike): void {
  const sections = asRecord(resumeData.sections);
  const skillsSection = asRecord(sections?.skills);
  const items = asArray(skillsSection?.items);
  if (!skillsSection || !items) return;

  skillsSection.items = items.map((raw) => {
    const skill = asRecord(raw) ?? {};
    return {
      ...skill,
      id: typeof skill.id === "string" && skill.id ? skill.id : createId(),
      visible: typeof skill.visible === "boolean" ? skill.visible : true,
      description:
        typeof skill.description === "string" ? skill.description : "",
      level: typeof skill.level === "number" ? skill.level : 1,
      keywords: Array.isArray(skill.keywords)
        ? skill.keywords.filter((k) => typeof k === "string")
        : [],
    };
  });
}

function applyTailoredSkillsV4(
  resumeData: RecordLike,
  skills: Array<RecordLike>,
): void {
  sanitizeV4SkillsSection(resumeData);
  const sections = asRecord(resumeData.sections);
  const skillsSection = asRecord(sections?.skills);
  if (!skillsSection) return;
  const existingItems = asArray(skillsSection.items) ?? [];
  const existing = existingItems
    .map((item) => asRecord(item))
    .filter((item): item is RecordLike => Boolean(item));

  skillsSection.items = skills.map((newSkill) => {
    const match = existing.find((item) => item.name === newSkill.name);
    return {
      id:
        (typeof newSkill.id === "string" && newSkill.id) ||
        (match && typeof match.id === "string" ? match.id : "") ||
        createId(),
      visible:
        typeof newSkill.visible === "boolean"
          ? newSkill.visible
          : typeof match?.visible === "boolean"
            ? match.visible
            : true,
      name:
        (typeof newSkill.name === "string" ? newSkill.name : "") ||
        (typeof match?.name === "string" ? match.name : ""),
      description:
        typeof newSkill.description === "string"
          ? newSkill.description
          : typeof match?.description === "string"
            ? match.description
            : "",
      level:
        typeof newSkill.level === "number"
          ? newSkill.level
          : typeof match?.level === "number"
            ? match.level
            : 0,
      keywords: Array.isArray(newSkill.keywords)
        ? newSkill.keywords.filter((k) => typeof k === "string")
        : Array.isArray(match?.keywords)
          ? match.keywords.filter((k) => typeof k === "string")
          : [],
    };
  });
}

function applyTailoredSkillsV5(
  resumeData: RecordLike,
  skills: Array<RecordLike>,
): void {
  const sections = asRecord(resumeData.sections);
  const skillsSection = asRecord(sections?.skills);
  const existingItems = asArray(skillsSection?.items);
  if (!skillsSection || !existingItems) return;
  const existing = existingItems
    .map((item) => asRecord(item))
    .filter((item): item is RecordLike => Boolean(item));

  const template = existing[0] ?? null;
  if (!template) return;

  skillsSection.items = skills.map((newSkill) => {
    const match =
      existing.find((item) => item.name === newSkill.name) ?? template;
    const next: RecordLike = { ...match };

    if ("id" in next) {
      next.id =
        (typeof newSkill.id === "string" && newSkill.id) ||
        (typeof match.id === "string" ? match.id : "") ||
        createId();
    }
    if ("name" in next) {
      next.name =
        (typeof newSkill.name === "string" ? newSkill.name : "") ||
        (typeof match.name === "string" ? match.name : "");
    }
    if ("keywords" in next) {
      next.keywords = Array.isArray(newSkill.keywords)
        ? newSkill.keywords.filter((k) => typeof k === "string")
        : Array.isArray(match.keywords)
          ? match.keywords.filter((k) => typeof k === "string")
          : [];
    }

    // Only patch optional fields when the instance already uses them.
    if ("description" in next) {
      next.description =
        typeof newSkill.description === "string"
          ? newSkill.description
          : typeof match.description === "string"
            ? match.description
            : "";
    }
    if ("proficiency" in next) {
      next.proficiency =
        typeof newSkill.proficiency === "string"
          ? newSkill.proficiency
          : typeof newSkill.description === "string"
            ? newSkill.description
            : typeof match.proficiency === "string"
              ? match.proficiency
              : "";
    }
    if ("level" in next) {
      next.level =
        typeof newSkill.level === "number"
          ? newSkill.level
          : typeof match.level === "number"
            ? match.level
            : next.level;
    }
    if ("hidden" in next) {
      next.hidden =
        typeof newSkill.hidden === "boolean"
          ? newSkill.hidden
          : typeof match.hidden === "boolean"
            ? match.hidden
            : next.hidden;
    }
    if ("visible" in next) {
      next.visible =
        typeof newSkill.visible === "boolean"
          ? newSkill.visible
          : typeof match.visible === "boolean"
            ? match.visible
            : next.visible;
    }

    return next;
  });
}

export function applyTailoredSkills(
  mode: RxResumeMode,
  resumeData: RecordLike,
  tailoredSkills?: TailoredSkillsInput,
): void {
  const parsed = parseTailoredSkills(tailoredSkills);
  if (!parsed) {
    if (mode === "v4") sanitizeV4SkillsSection(resumeData);
    return;
  }
  if (mode === "v4") {
    applyTailoredSkillsV4(resumeData, parsed);
    return;
  }
  applyTailoredSkillsV5(resumeData, parsed);
}

export function extractProjectsFromResume(
  mode: RxResumeMode,
  resumeData: RecordLike,
): {
  catalog: ResumeProjectCatalogItem[];
  selectionItems: ResumeProjectSelectionItem[];
} {
  const sections = asRecord(resumeData.sections);
  const projectsSection = asRecord(sections?.projects);
  const items = asArray(projectsSection?.items);
  if (!items) return { catalog: [], selectionItems: [] };

  const catalog: ResumeProjectCatalogItem[] = [];
  const selectionItems: ResumeProjectSelectionItem[] = [];

  for (const raw of items) {
    const item = asRecord(raw);
    if (!item) continue;
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) continue;

    const name = typeof item.name === "string" ? item.name : id;
    const description =
      typeof item.description === "string" ? item.description : "";
    const date =
      mode === "v5"
        ? typeof item.period === "string"
          ? item.period
          : ""
        : typeof item.date === "string"
          ? item.date
          : "";

    const isVisibleInBase =
      mode === "v5"
        ? !(typeof item.hidden === "boolean" ? item.hidden : false)
        : Boolean(item.visible);

    const summaryRaw =
      mode === "v5"
        ? description
        : typeof item.summary === "string"
          ? item.summary
          : "";

    const base: ResumeProjectCatalogItem = {
      id,
      name,
      description,
      date,
      isVisibleInBase,
    };
    catalog.push(base);
    selectionItems.push({
      ...base,
      summaryText: stripHtmlTags(summaryRaw),
    });
  }

  return { catalog, selectionItems };
}

export function applyProjectVisibility(args: {
  mode: RxResumeMode;
  resumeData: RecordLike;
  selectedProjectIds: ReadonlySet<string>;
  forceVisibleProjectsSection?: boolean;
}): void {
  const sections = asRecord(args.resumeData.sections);
  const projectsSection = asRecord(sections?.projects);
  const items = asArray(projectsSection?.items);
  if (!projectsSection || !items) return;

  for (const raw of items) {
    const item = asRecord(raw);
    if (!item) continue;
    const id = typeof item.id === "string" ? item.id : "";
    if (!id) continue;
    if (args.mode === "v5") {
      if ("hidden" in item) {
        item.hidden = !args.selectedProjectIds.has(id);
      } else if ("visible" in item) {
        item.visible = args.selectedProjectIds.has(id);
      }
    } else {
      item.visible = args.selectedProjectIds.has(id);
    }
  }

  if (args.forceVisibleProjectsSection !== false) {
    if (args.mode === "v5") {
      if ("hidden" in projectsSection) {
        projectsSection.hidden = false;
      } else if ("visible" in projectsSection) {
        projectsSection.visible = true;
      }
    } else {
      projectsSection.visible = true;
    }
  }
}

export function applyTailoredChunks(args: {
  mode: RxResumeMode;
  resumeData: RecordLike;
  tailoredContent: TailorChunkInput;
}): void {
  applyTailoredSkills(args.mode, args.resumeData, args.tailoredContent.skills);
  applyTailoredSummary(
    args.mode,
    args.resumeData,
    args.tailoredContent.summary,
  );
  applyTailoredHeadline(
    args.mode,
    args.resumeData,
    args.tailoredContent.headline,
  );
}
