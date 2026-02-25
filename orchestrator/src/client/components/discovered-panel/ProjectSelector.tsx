import type { ResumeProjectCatalogItem } from "@shared/types.js";
import { AlertTriangle } from "lucide-react";
import type React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface ProjectSelectorProps {
  catalog: ResumeProjectCatalogItem[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  maxProjects: number;
  disabled: boolean;
}

export const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  catalog,
  selectedIds,
  onToggle,
  maxProjects,
  disabled,
}) => {
  const tooManyProjects = selectedIds.size > maxProjects;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-start gap-2 sm:items-center sm:justify-between">
        {tooManyProjects && (
          <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
            <AlertTriangle className="h-3 w-3" />
            Max {maxProjects} recommended
          </span>
        )}
      </div>

      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
        {catalog.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            Loading projects...
          </div>
        ) : (
          catalog.map((project) => (
            <label
              key={project.id}
              htmlFor={`project-${project.id}`}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors cursor-pointer",
                selectedIds.has(project.id)
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/40 bg-muted/5 hover:bg-muted/10",
                disabled && "opacity-50 cursor-not-allowed",
              )}
            >
              <Checkbox
                id={`project-${project.id}`}
                checked={selectedIds.has(project.id)}
                onCheckedChange={() => onToggle(project.id)}
                disabled={disabled}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{project.name}</div>
                <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                  {project.description}
                </div>
              </div>
            </label>
          ))
        )}
      </div>
    </div>
  );
};
