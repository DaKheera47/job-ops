import type { ResumeProjectSelectionResolution } from "@shared/resume-projects";
import type { ResumeProjectCatalogItem } from "@shared/types.js";
import type React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, stripHtml } from "@/lib/utils";

interface ProjectSelectorProps {
  catalog: ResumeProjectCatalogItem[];
  resolution: ResumeProjectSelectionResolution;
  onToggle: (id: string) => void;
  disabled: boolean;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  catalog,
  resolution,
  onToggle,
  disabled,
}) => {
  const mustIncludeIds = new Set(resolution.mustIncludeIds);
  const aiSelectableIds = new Set(resolution.aiSelectableIds);
  const selectedIds = new Set(resolution.effectiveSelectedIds);
  const targetFilled = selectedIds.size >= resolution.targetCount;
  const projects = catalog.filter(
    (project) =>
      mustIncludeIds.has(project.id) || aiSelectableIds.has(project.id),
  );

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        {selectedIds.size} of {resolution.targetCount} projects selected
      </p>

      <div className="space-y-1.5">
        {projects.map((project) => {
          const description = stripHtml(project.description);
          const mustInclude = mustIncludeIds.has(project.id);
          const selected = selectedIds.has(project.id);
          const needsRemovalFirst = !selected && targetFilled;
          const projectDisabled = disabled || mustInclude || needsRemovalFirst;

          return (
            <label
              key={project.id}
              htmlFor={`project-${project.id}`}
              title={needsRemovalFirst ? "Remove a project first." : undefined}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors cursor-pointer",
                selected
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/40 bg-muted/5 hover:bg-muted/10",
                projectDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              <Checkbox
                id={`project-${project.id}`}
                checked={selected}
                onCheckedChange={() => onToggle(project.id)}
                disabled={projectDisabled}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{project.name}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {mustInclude
                      ? "Must include"
                      : selected
                        ? "Selected"
                        : "Available"}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                  {description}
                </div>
                {needsRemovalFirst ? (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Remove a project first.
                  </div>
                ) : null}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};
