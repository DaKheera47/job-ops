import React from "react"

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ResumeProjectCatalogItem, ResumeProjectsSettings } from "@shared/types"
import { clampInt } from "@/lib/utils"

type ResumeProjectsSectionProps = {
  resumeProjectsDraft: ResumeProjectsSettings | null
  setResumeProjectsDraft: (value: ResumeProjectsSettings | null) => void
  profileProjects: ResumeProjectCatalogItem[]
  lockedCount: number
  maxProjectsTotal: number
  isLoading: boolean
  isSaving: boolean
}

export const ResumeProjectsSection: React.FC<ResumeProjectsSectionProps> = ({
  resumeProjectsDraft,
  setResumeProjectsDraft,
  profileProjects,
  lockedCount,
  maxProjectsTotal,
  isLoading,
  isSaving,
}) => {
  return (
    <AccordionItem value="resume-projects" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Resume Projects</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Max projects included</div>
            <Input
              type="number"
              inputMode="numeric"
              min={lockedCount}
              max={maxProjectsTotal}
              value={resumeProjectsDraft?.maxProjects ?? 0}
              onChange={(event) => {
                if (!resumeProjectsDraft) return
                const next = Number(event.target.value)
                const clamped = clampInt(next, lockedCount, maxProjectsTotal)
                setResumeProjectsDraft({ ...resumeProjectsDraft, maxProjects: clamped })
              }}
              disabled={isLoading || isSaving || !resumeProjectsDraft}
            />
            <div className="text-xs text-muted-foreground">
              Locked projects always count towards this cap. Locked: {lockedCount} · AI pool:{" "}
              {resumeProjectsDraft?.aiSelectableProjectIds.length ?? 0} · Total projects: {maxProjectsTotal}
            </div>
          </div>

          <Separator />

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead className="w-[110px]">Base visible</TableHead>
                <TableHead className="w-[90px]">Locked</TableHead>
                <TableHead className="w-[140px]">AI selectable</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profileProjects.map((project) => {
                const locked = Boolean(resumeProjectsDraft?.lockedProjectIds.includes(project.id))
                const aiSelectable = Boolean(resumeProjectsDraft?.aiSelectableProjectIds.includes(project.id))
                const excluded = !locked && !aiSelectable

                return (
                  <TableRow key={project.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="font-medium">{project.name || project.id}</div>
                        <div className="text-xs text-muted-foreground">
                          {[project.description, project.date].filter(Boolean).join(" · ")}
                          {excluded ? " · Excluded" : ""}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{project.isVisibleInBase ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <Checkbox
                        checked={locked}
                        disabled={isLoading || isSaving || !resumeProjectsDraft}
                        onCheckedChange={(checked) => {
                          if (!resumeProjectsDraft) return
                          const isChecked = checked === true
                          const lockedIds = resumeProjectsDraft.lockedProjectIds.slice()
                          const selectableIds = resumeProjectsDraft.aiSelectableProjectIds.slice()

                          if (isChecked) {
                            if (!lockedIds.includes(project.id)) lockedIds.push(project.id)
                            const nextSelectable = selectableIds.filter((id) => id !== project.id)
                            const minCap = lockedIds.length
                            setResumeProjectsDraft({
                              ...resumeProjectsDraft,
                              lockedProjectIds: lockedIds,
                              aiSelectableProjectIds: nextSelectable,
                              maxProjects: Math.max(resumeProjectsDraft.maxProjects, minCap),
                            })
                            return
                          }

                          const nextLocked = lockedIds.filter((id) => id !== project.id)
                          if (!selectableIds.includes(project.id)) selectableIds.push(project.id)
                          setResumeProjectsDraft({
                            ...resumeProjectsDraft,
                            lockedProjectIds: nextLocked,
                            aiSelectableProjectIds: selectableIds,
                            maxProjects: clampInt(resumeProjectsDraft.maxProjects, nextLocked.length, maxProjectsTotal),
                          })
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Checkbox
                        checked={locked ? true : aiSelectable}
                        disabled={locked || isLoading || isSaving || !resumeProjectsDraft}
                        onCheckedChange={(checked) => {
                          if (!resumeProjectsDraft) return
                          const isChecked = checked === true
                          const selectableIds = resumeProjectsDraft.aiSelectableProjectIds.slice()
                          const nextSelectable = isChecked
                            ? selectableIds.includes(project.id)
                              ? selectableIds
                              : [...selectableIds, project.id]
                            : selectableIds.filter((id) => id !== project.id)
                          setResumeProjectsDraft({ ...resumeProjectsDraft, aiSelectableProjectIds: nextSelectable })
                        }}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
