import type { ResumeProjectCatalogItem, ResumeProjectsSettings } from '../../shared/types.js';

type ResumeProjectSelectionItem = ResumeProjectCatalogItem & { summaryText: string };
export function extractProjectsFromProfile(profile: unknown): {
  catalog: ResumeProjectCatalogItem[];
  selectionItems: ResumeProjectSelectionItem[];
} {
  const items = (profile as any)?.sections?.projects?.items;
  if (!Array.isArray(items)) return { catalog: [], selectionItems: [] };

  const catalog: ResumeProjectCatalogItem[] = [];
  const selectionItems: ResumeProjectSelectionItem[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    const id = typeof (item as any).id === 'string' ? (item as any).id : '';
    if (!id) continue;

    const name = typeof (item as any).name === 'string' ? (item as any).name : '';
    const description = typeof (item as any).description === 'string' ? (item as any).description : '';
    const date = typeof (item as any).date === 'string' ? (item as any).date : '';
    const isVisibleInBase = Boolean((item as any).visible);
    const summary = typeof (item as any).summary === 'string' ? (item as any).summary : '';
    const summaryText = stripHtml(summary);

    const base: ResumeProjectCatalogItem = { id, name, description, date, isVisibleInBase };
    catalog.push(base);
    selectionItems.push({ ...base, summaryText });
  }

  return { catalog, selectionItems };
}

export function buildDefaultResumeProjectsSettings(
  catalog: ResumeProjectCatalogItem[]
): ResumeProjectsSettings {
  const lockedProjectIds = catalog.filter((p) => p.isVisibleInBase).map((p) => p.id);
  const lockedSet = new Set(lockedProjectIds);

  const aiSelectableProjectIds = catalog
    .map((p) => p.id)
    .filter((id) => !lockedSet.has(id));

  const total = catalog.length;
  const preferredMax = Math.max(lockedProjectIds.length, 3);
  const maxProjects = total === 0 ? 0 : Math.min(total, preferredMax);

  return normalizeResumeProjectsSettings(
    { maxProjects, lockedProjectIds, aiSelectableProjectIds },
    new Set(catalog.map((p) => p.id))
  );
}

export function parseResumeProjectsSettings(raw: string | null): ResumeProjectsSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as any;
    if (!parsed || typeof parsed !== 'object') return null;
    const maxProjects = parsed.maxProjects;
    const lockedProjectIds = parsed.lockedProjectIds;
    const aiSelectableProjectIds = parsed.aiSelectableProjectIds;

    if (typeof maxProjects !== 'number') return null;
    if (!Array.isArray(lockedProjectIds) || !Array.isArray(aiSelectableProjectIds)) return null;
    if (!lockedProjectIds.every((v: unknown) => typeof v === 'string')) return null;
    if (!aiSelectableProjectIds.every((v: unknown) => typeof v === 'string')) return null;

    return {
      maxProjects,
      lockedProjectIds,
      aiSelectableProjectIds,
    };
  } catch {
    return null;
  }
}

export function normalizeResumeProjectsSettings(
  settings: ResumeProjectsSettings,
  allowedProjectIds?: ReadonlySet<string>
): ResumeProjectsSettings {
  const allowed = allowedProjectIds && allowedProjectIds.size > 0 ? allowedProjectIds : null;

  const lockedProjectIds = uniqueStrings(settings.lockedProjectIds).filter((id) => (allowed ? allowed.has(id) : true));
  const lockedSet = new Set(lockedProjectIds);

  const aiSelectableProjectIds = uniqueStrings(settings.aiSelectableProjectIds)
    .filter((id) => (allowed ? allowed.has(id) : true))
    .filter((id) => !lockedSet.has(id));

  const maxCap = allowed ? allowed.size : Number.POSITIVE_INFINITY;
  const maxProjectsRaw = Number.isFinite(settings.maxProjects) ? settings.maxProjects : 0;
  const maxProjectsInt = Math.max(0, Math.floor(maxProjectsRaw));
  const minRequired = lockedProjectIds.length;
  const maxProjects = Math.min(maxCap, Math.max(minRequired, maxProjectsInt));

  return { maxProjects, lockedProjectIds, aiSelectableProjectIds };
}

export function resolveResumeProjectsSettings(args: {
  catalog: ResumeProjectCatalogItem[];
  overrideRaw: string | null;
}): {
  profileProjects: ResumeProjectCatalogItem[];
  defaultResumeProjects: ResumeProjectsSettings;
  overrideResumeProjects: ResumeProjectsSettings | null;
  resumeProjects: ResumeProjectsSettings;
} {
  const profileProjects = args.catalog;
  const allowed = new Set(profileProjects.map((p) => p.id));
  const defaultResumeProjects = buildDefaultResumeProjectsSettings(profileProjects);
  const overrideParsed = parseResumeProjectsSettings(args.overrideRaw);
  const overrideResumeProjects = overrideParsed
    ? normalizeResumeProjectsSettings(overrideParsed, allowed)
    : null;

  const resumeProjects = overrideResumeProjects
    ? normalizeResumeProjectsSettings(overrideResumeProjects, allowed)
    : defaultResumeProjects;

  return {
    profileProjects,
    defaultResumeProjects,
    overrideResumeProjects,
    resumeProjects,
  };
}

export function stripHtml(input: string): string {
  const withoutTags = input.replace(/<[^>]*>/g, ' ');
  return withoutTags.replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export type { ResumeProjectSelectionItem };
