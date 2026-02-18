import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type { ResumeProjectCatalogItem } from "@shared/types.js";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { clampInt } from "@/lib/utils";
import {
  toggleAiSelectable,
  toggleMustInclude,
} from "../resume-projects-state";
import { BaseResumeSelection } from "./BaseResumeSelection";

type ReactiveResumeSectionProps = {
  rxResumeBaseResumeIdDraft: string | null;
  setRxResumeBaseResumeIdDraft: (value: string | null) => void;
  // True when v4 credentials or v5 API key are configured.
  hasRxResumeAccess: boolean;
  profileProjects: ResumeProjectCatalogItem[];
  lockedCount: number;
  maxProjectsTotal: number;
  isProjectsLoading: boolean;
  isLoading: boolean;
  isSaving: boolean;
};

export const ReactiveResumeSection: React.FC<ReactiveResumeSectionProps> = ({
  rxResumeBaseResumeIdDraft,
  setRxResumeBaseResumeIdDraft,
  hasRxResumeAccess,
  profileProjects,
  lockedCount,
  maxProjectsTotal,
  isProjectsLoading,
  isLoading,
  isSaving,
}) => {
  const {
    control,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  return (
    <AccordionItem value="reactive-resume" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Reactive Resume</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          {!hasRxResumeAccess ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>RxResume Access Missing</AlertTitle>
              <AlertDescription>
                Configure RxResume credentials in settings (email + password) or
                set <code>RXRESUME_API_KEY</code> to enable access.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert className="bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-900/20">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertTitle className="text-green-800 dark:text-green-300">
                  RxResume Access Ready
                </AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-400">
                  Reactive Resume access is active.
                </AlertDescription>
              </Alert>

              <BaseResumeSelection
                value={rxResumeBaseResumeIdDraft}
                onValueChange={setRxResumeBaseResumeIdDraft}
                hasRxResumeAccess={hasRxResumeAccess}
                disabled={isLoading || isSaving}
              />

              <Separator />

              <div className="space-y-4">
                {!rxResumeBaseResumeIdDraft ? (
                  <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                    Choose a PDF to configure resume projects.
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        Max projects to choose
                      </div>
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
                              if (!field.value) return;
                              const next = Number(event.target.value);
                              const clamped = clampInt(
                                next,
                                lockedCount,
                                maxProjectsTotal,
                              );
                              field.onChange({
                                ...field.value,
                                maxProjects: clamped,
                              });
                            }}
                            disabled={
                              isLoading ||
                              isSaving ||
                              isProjectsLoading ||
                              !field.value
                            }
                          />
                        )}
                      />
                      {errors.resumeProjects?.maxProjects && (
                        <p className="text-xs text-destructive">
                          {errors.resumeProjects.maxProjects.message}
                        </p>
                      )}
                    </div>

                    <Controller
                      name="resumeProjects"
                      control={control}
                      render={({ field }) => (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs whitespace-wrap sm:whitespace-nowrap">
                                Project
                              </TableHead>
                              <TableHead className="text-xs whitespace-wrap sm:whitespace-nowrap">
                                Visible in template
                              </TableHead>
                              <TableHead className="text-xs whitespace-wrap sm:whitespace-nowrap">
                                Must Include
                              </TableHead>
                              <TableHead className="text-xs whitespace-wrap sm:whitespace-nowrap">
                                AI selectable
                              </TableHead>
                            </TableRow>
                          </TableHeader>

                          <TableBody>
                            {profileProjects.map((project) => {
                              const locked = Boolean(
                                field.value?.lockedProjectIds.includes(
                                  project.id,
                                ),
                              );
                              const aiSelectable = Boolean(
                                field.value?.aiSelectableProjectIds.includes(
                                  project.id,
                                ),
                              );

                              return (
                                <TableRow key={project.id}>
                                  <TableCell>
                                    <div className="space-y-0.5">
                                      <div className="font-medium">
                                        {project.name || project.id}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {[project.description, project.date]
                                          .filter(Boolean)
                                          .join(" - ")}
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-xs text-muted-foreground">
                                    {project.isVisibleInBase ? "Yes" : "No"}
                                  </TableCell>
                                  <TableCell>
                                    <Checkbox
                                      checked={locked}
                                      disabled={
                                        isLoading ||
                                        isSaving ||
                                        isProjectsLoading ||
                                        !field.value
                                      }
                                      onCheckedChange={(checked) => {
                                        if (!field.value) return;
                                        field.onChange(
                                          toggleMustInclude({
                                            settings: field.value,
                                            projectId: project.id,
                                            checked: checked === true,
                                            maxProjectsTotal,
                                          }),
                                        );
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <Checkbox
                                      checked={locked ? true : aiSelectable}
                                      disabled={
                                        locked ||
                                        isLoading ||
                                        isSaving ||
                                        isProjectsLoading ||
                                        !field.value
                                      }
                                      onCheckedChange={(checked) => {
                                        if (!field.value) return;
                                        field.onChange(
                                          toggleAiSelectable({
                                            settings: field.value,
                                            projectId: project.id,
                                            checked: checked === true,
                                          }),
                                        );
                                      }}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      )}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
