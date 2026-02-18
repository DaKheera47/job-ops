import type { ResumeProjectsSettings } from "@shared/types.js";
import { clampInt } from "@/lib/utils";

export function toggleMustInclude(args: {
  settings: ResumeProjectsSettings;
  projectId: string;
  checked: boolean;
  maxProjectsTotal: number;
}): ResumeProjectsSettings {
  const { settings, projectId, checked, maxProjectsTotal } = args;
  const lockedIds = settings.lockedProjectIds.slice();
  const selectableIds = settings.aiSelectableProjectIds.slice();

  if (checked) {
    if (!lockedIds.includes(projectId)) lockedIds.push(projectId);
    const nextSelectable = selectableIds.filter((id) => id !== projectId);
    const minCap = lockedIds.length;
    return {
      ...settings,
      lockedProjectIds: lockedIds,
      aiSelectableProjectIds: nextSelectable,
      maxProjects: Math.max(settings.maxProjects, minCap),
    };
  }

  const nextLocked = lockedIds.filter((id) => id !== projectId);
  return {
    ...settings,
    lockedProjectIds: nextLocked,
    maxProjects: clampInt(
      settings.maxProjects,
      nextLocked.length,
      maxProjectsTotal,
    ),
  };
}

export function toggleAiSelectable(args: {
  settings: ResumeProjectsSettings;
  projectId: string;
  checked: boolean;
}): ResumeProjectsSettings {
  const { settings, projectId, checked } = args;
  const selectableIds = settings.aiSelectableProjectIds.slice();
  const nextSelectable = checked
    ? selectableIds.includes(projectId)
      ? selectableIds
      : [...selectableIds, projectId]
    : selectableIds.filter((id) => id !== projectId);

  return {
    ...settings,
    aiSelectableProjectIds: nextSelectable,
  };
}
