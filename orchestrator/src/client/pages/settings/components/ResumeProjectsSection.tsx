import React from "react"
import { useFormContext, Controller } from "react-hook-form"

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { ResumeProjectCatalogItem } from "@shared/types"
import { clampInt } from "@/lib/utils"
import { UpdateSettingsInput } from "@shared/settings-schema"

type ResumeProjectsSectionProps = {
  profileProjects: ResumeProjectCatalogItem[]
  lockedCount: number
  maxProjectsTotal: number
  isLoading: boolean
  isSaving: boolean
}

export const ResumeProjectsSection: React.FC<ResumeProjectsSectionProps> = ({
  profileProjects,
  lockedCount,
  maxProjectsTotal,
  isLoading,
  isSaving,
}) => {
  const { control, formState: { errors } } = useFormContext<UpdateSettingsInput>()

  return (
    <AccordionItem value="resume-projects" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Resume Projects</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Max projects included</div>
            <Controller
              name="resumeProjects"
              control={control}
              render={({ field }) => (
                <Input
                  type="number"
                  inputMode="numeric"
                  min={lockedCount}
                  max={maxProjectsTotal}
                  value={field.value?.maxProjects ?? 0}
                  onChange={(event) => {
                    if (!field.value) return
                    const next = Number(event.target.value)
                    const clamped = clampInt(next, lockedCount, maxProjectsTotal)
                    field.onChange({ ...field.value, maxProjects: clamped })
                  }}
                  disabled={isLoading || isSaving || !field.value}
                />
              )}
            />
            {errors.resumeProjects?.maxProjects && <p className="text-xs text-destructive">{errors.resumeProjects.maxProjects.message}</p>}
            <div className="text-xs text-muted-foreground">
              AI pool (max projects AI can use): {maxProjectsTotal}. Locked projects always count towards this cap. Locked: {lockedCount} · Total profile projects: {profileProjects.length}
            </div>
          </div>

          <Separator />

          <Controller
            name="resumeProjects"
            control={control}
            render={({ field }) => (
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
                    const locked = Boolean(field.value?.lockedProjectIds.includes(project.id))
                    const aiSelectable = Boolean(field.value?.aiSelectableProjectIds.includes(project.id))
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
                            disabled={isLoading || isSaving || !field.value}
                            onCheckedChange={(checked) => {
                              if (!field.value) return
                              const isChecked = checked === true
                              const lockedIds = field.value.lockedProjectIds.slice()
                              const selectableIds = field.value.aiSelectableProjectIds.slice()

                              if (isChecked) {
                                if (!lockedIds.includes(project.id)) lockedIds.push(project.id)
                                const nextSelectable = selectableIds.filter((id) => id !== project.id)
                                const minCap = lockedIds.length
                                field.onChange({
                                  ...field.value,
                                  lockedProjectIds: lockedIds,
                                  aiSelectableProjectIds: nextSelectable,
                                  maxProjects: Math.max(field.value.maxProjects, minCap),
                                })
                                return
                              }

                              const nextLocked = lockedIds.filter((id) => id !== project.id)
                              if (!selectableIds.includes(project.id)) selectableIds.push(project.id)
                              field.onChange({
                                ...field.value,
                                lockedProjectIds: nextLocked,
                                aiSelectableProjectIds: selectableIds,
                                maxProjects: clampInt(field.value.maxProjects, nextLocked.length, maxProjectsTotal),
                              })
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={locked ? true : aiSelectable}
                            disabled={locked || isLoading || isSaving || !field.value}
                            onCheckedChange={(checked) => {
                              if (!field.value) return
                              const isChecked = checked === true
                              const selectableIds = field.value.aiSelectableProjectIds.slice()
                              const nextSelectable = isChecked
                                ? selectableIds.includes(project.id)
                                  ? selectableIds
                                  : [...selectableIds, project.id]
                                : selectableIds.filter((id) => id !== project.id)
                              field.onChange({ ...field.value, aiSelectableProjectIds: nextSelectable })
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}

