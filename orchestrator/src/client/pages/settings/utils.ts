/**
 * Settings page helpers.
 */

import { arraysEqual } from "@/lib/utils"
import type { ResumeProjectsSettings } from "@shared/types"

export function resumeProjectsEqual(a: ResumeProjectsSettings, b: ResumeProjectsSettings) {
  return (
    a.maxProjects === b.maxProjects &&
    arraysEqual(a.lockedProjectIds, b.lockedProjectIds) &&
    arraysEqual(a.aiSelectableProjectIds, b.aiSelectableProjectIds)
  )
}
