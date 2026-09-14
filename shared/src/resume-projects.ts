import type { ResumeProjectCatalogItem, ResumeProjectsSettings } from "./types";

export interface ResumeProjectSelectionResolution {
  mustIncludeIds: string[];
  aiSelectableIds: string[];
  excludedIds: string[];
  effectiveSelectedIds: string[];
  targetCount: number;
  remainingSlots: number;
}

export function resolveResumeProjectSelection(args: {
  catalog: ResumeProjectCatalogItem[];
  resumeProjects: ResumeProjectsSettings;
  selectedProjectIds?: string | readonly string[] | null;
}): ResumeProjectSelectionResolution {
  const catalogIds = unique(args.catalog.map((project) => project.id));
  const catalogSet = new Set(catalogIds);
  const mustIncludeIds = unique(args.resumeProjects.lockedProjectIds).filter(
    (id) => catalogSet.has(id),
  );
  const mustIncludeSet = new Set(mustIncludeIds);
  const aiSelectableIds = unique(
    args.resumeProjects.aiSelectableProjectIds,
  ).filter((id) => catalogSet.has(id) && !mustIncludeSet.has(id));
  const aiSelectableSet = new Set(aiSelectableIds);
  const excludedIds = catalogIds.filter(
    (id) => !mustIncludeSet.has(id) && !aiSelectableSet.has(id),
  );
  const targetCount = Math.max(
    mustIncludeIds.length,
    Number.isFinite(args.resumeProjects.maxProjects)
      ? Math.max(0, Math.floor(args.resumeProjects.maxProjects))
      : 0,
  );
  const selected =
    typeof args.selectedProjectIds === "string"
      ? args.selectedProjectIds.split(",")
      : (args.selectedProjectIds ?? []);
  const selectedAiIds = unique(selected).filter((id) =>
    aiSelectableSet.has(id),
  );
  const effectiveSelectedIds = [
    ...mustIncludeIds,
    ...selectedAiIds.slice(0, targetCount - mustIncludeIds.length),
  ];

  return {
    mustIncludeIds,
    aiSelectableIds,
    excludedIds,
    effectiveSelectedIds,
    targetCount,
    remainingSlots: Math.max(0, targetCount - effectiveSelectedIds.length),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
