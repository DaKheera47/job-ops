import { BaseResumeSelection } from "@client/pages/settings/components/BaseResumeSelection";
import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import {
  toggleAiSelectable,
  toggleMustInclude,
} from "@client/pages/settings/resume-projects-state";
import type { ResumeProjectsSettingsInput } from "@shared/settings-schema.js";
import type { ResumeProjectCatalogItem, RxResumeMode } from "@shared/types.js";
import type React from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { clampInt } from "@/lib/utils";
import { StatusIndicator } from "./StatusIndicator";

type VersionValidationState = {
  checked: boolean;
  valid: boolean;
  message?: string | null;
};

type ProjectSelectionConfig = {
  baseResumeId: string | null;
  onBaseResumeIdChange: (value: string | null) => void;
  projects: ResumeProjectCatalogItem[];
  value: ResumeProjectsSettingsInput | null | undefined;
  onChange: (next: ResumeProjectsSettingsInput) => void;
  lockedCount: number;
  maxProjectsTotal: number;
  isProjectsLoading: boolean;
  disabled: boolean;
  maxProjectsError?: string;
};

type ReactiveResumeConfigPanelProps = {
  mode: RxResumeMode;
  onModeChange: (mode: RxResumeMode) => void;
  disabled?: boolean;
  hasRxResumeAccess?: boolean;
  showValidationStatus?: boolean;
  validationStatuses?: {
    v4: VersionValidationState;
    v5: VersionValidationState;
  };
  intro?: {
    title: string;
    description?: string;
  };
  v5: {
    apiKey: string;
    onApiKeyChange: (value: string) => void;
    error?: string;
    helper?: string;
    placeholder?: string;
  };
  v4: {
    email: string;
    onEmailChange: (value: string) => void;
    emailError?: string;
    password: string;
    onPasswordChange: (value: string) => void;
    passwordError?: string;
    emailPlaceholder?: string;
    passwordPlaceholder?: string;
  };
  projectSelection?: ProjectSelectionConfig;
};

function renderStatusPill(label: string, state: VersionValidationState) {
  const statusLabel = state.checked
    ? state.valid
      ? "Connected"
      : "Failed"
    : "Not tested";
  const dotColor = state.checked
    ? state.valid
      ? "bg-emerald-500"
      : "bg-destructive"
    : "bg-muted-foreground";

  return (
    <StatusIndicator
      label={`${label}: ${statusLabel}`}
      dotColor={dotColor}
      tooltip={
        state.checked && !state.valid && state.message
          ? state.message
          : undefined
      }
    />
  );
}

export const ReactiveResumeConfigPanel: React.FC<
  ReactiveResumeConfigPanelProps
> = ({
  mode,
  onModeChange,
  disabled = false,
  hasRxResumeAccess = false,
  showValidationStatus = false,
  validationStatuses,
  intro,
  v5,
  v4,
  projectSelection,
}) => {
  const canShowProjectSelection = Boolean(
    projectSelection && hasRxResumeAccess,
  );
  const selectedValidationStatus = validationStatuses?.[mode];
  const handleModeChange = (value: string) =>
    onModeChange(value === "v4" ? "v4" : "v5");

  return (
    <div className="space-y-4">
      {intro ? (
        <div>
          <p className="text-sm font-semibold">{intro.title}</p>
          {intro.description ? (
            <p className="text-xs text-muted-foreground">{intro.description}</p>
          ) : null}
        </div>
      ) : null}

      <Tabs value={mode} onValueChange={handleModeChange}>
        <TabsList className="grid h-auto w-full grid-cols-2">
          <TabsTrigger value="v5" disabled={disabled}>
            v5 (API key)
          </TabsTrigger>
          <TabsTrigger value="v4" disabled={disabled}>
            v4 (Email + Password)
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {showValidationStatus && selectedValidationStatus ? (
        <div className="flex flex-wrap items-center gap-2 text-xs w-full justify-between">
          {renderStatusPill(`${mode} status`, selectedValidationStatus)}
        </div>
      ) : null}

      {mode === "v5" ? (
        <div className="grid gap-4">
          <SettingsInput
            label="v5 API key"
            inputProps={{
              name: "rxresumeApiKey",
              value: v5.apiKey,
              onChange: (event) => v5.onApiKeyChange(event.currentTarget.value),
            }}
            type="password"
            placeholder={v5.placeholder ?? "Enter v5 API key"}
            helper={v5.helper}
            disabled={disabled}
            error={v5.error}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <SettingsInput
            label="v4 Email"
            inputProps={{
              name: "rxresumeEmail",
              value: v4.email,
              onChange: (event) => v4.onEmailChange(event.currentTarget.value),
            }}
            placeholder={v4.emailPlaceholder ?? "you@example.com"}
            disabled={disabled}
            error={v4.emailError}
          />
          <SettingsInput
            label="v4 Password"
            inputProps={{
              name: "rxresumePassword",
              value: v4.password,
              onChange: (event) =>
                v4.onPasswordChange(event.currentTarget.value),
            }}
            type="password"
            placeholder={v4.passwordPlaceholder ?? "Enter v4 password"}
            disabled={disabled}
            error={v4.passwordError}
          />
        </div>
      )}

      {projectSelection ? (
        <>
          <Separator />

          {!canShowProjectSelection ? (
            <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              Connect Reactive Resume and choose a template resume to configure
              resume projects.
            </div>
          ) : (
            <div className="space-y-4">
              <BaseResumeSelection
                value={projectSelection.baseResumeId}
                onValueChange={projectSelection.onBaseResumeIdChange}
                hasRxResumeAccess={hasRxResumeAccess}
                rxresumeMode={mode}
                disabled={projectSelection.disabled}
              />

              {!projectSelection.baseResumeId ? (
                <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  Choose a PDF to configure resume projects.
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <div className="text-sm font-medium">
                      Max projects to choose
                    </div>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={projectSelection.lockedCount}
                      max={projectSelection.maxProjectsTotal}
                      value={projectSelection.value?.maxProjects ?? 0}
                      onChange={(event) => {
                        if (!projectSelection.value) return;
                        const next = Number(event.target.value);
                        const clamped = clampInt(
                          next,
                          projectSelection.lockedCount,
                          projectSelection.maxProjectsTotal,
                        );
                        projectSelection.onChange({
                          ...projectSelection.value,
                          maxProjects: clamped,
                        });
                      }}
                      disabled={
                        projectSelection.disabled ||
                        projectSelection.isProjectsLoading ||
                        !projectSelection.value
                      }
                    />
                    {projectSelection.maxProjectsError ? (
                      <p className="text-xs text-destructive">
                        {projectSelection.maxProjectsError}
                      </p>
                    ) : null}
                  </div>

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
                      {projectSelection.projects.map((project) => {
                        const value = projectSelection.value;
                        const locked = Boolean(
                          value?.lockedProjectIds.includes(project.id),
                        );
                        const aiSelectable = Boolean(
                          value?.aiSelectableProjectIds.includes(project.id),
                        );
                        const projectMeta =
                          mode === "v5"
                            ? project.date
                            : [project.description, project.date]
                                .filter(Boolean)
                                .join(" - ");

                        return (
                          <TableRow key={project.id}>
                            <TableCell>
                              <div className="space-y-0.5">
                                <div className="font-medium">
                                  {project.name}
                                </div>
                                {projectMeta ? (
                                  <div className="text-xs text-muted-foreground">
                                    {projectMeta}
                                  </div>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              {project.isVisibleInBase ? "Yes" : "No"}
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={locked}
                                onCheckedChange={() => {
                                  if (!value) return;
                                  projectSelection.onChange(
                                    toggleMustInclude({
                                      settings: value,
                                      projectId: project.id,
                                      checked: !locked,
                                      maxProjectsTotal:
                                        projectSelection.maxProjectsTotal,
                                    }),
                                  );
                                }}
                                disabled={
                                  projectSelection.disabled ||
                                  projectSelection.isProjectsLoading ||
                                  !value
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={locked ? true : aiSelectable}
                                onCheckedChange={() => {
                                  if (!value) return;
                                  projectSelection.onChange(
                                    toggleAiSelectable({
                                      settings: value,
                                      projectId: project.id,
                                      checked: !aiSelectable,
                                    }),
                                  );
                                }}
                                disabled={
                                  projectSelection.disabled ||
                                  projectSelection.isProjectsLoading ||
                                  locked ||
                                  !value
                                }
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
};
