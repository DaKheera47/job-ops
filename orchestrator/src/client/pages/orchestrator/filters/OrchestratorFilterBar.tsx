import { RotateCcw } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import type { OrchestratorFilterBarProps } from "./types";

export const OrchestratorFilterBar: React.FC<OrchestratorFilterBarProps> = ({
  activeFilterCount,
  onResetFilters,
  children,
}) => (
  <div
    id="orchestrator-filter-bar"
    className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto rounded-full bg-muted p-2 [&>*]:shrink-0"
  >
    {children}

    {activeFilterCount > 0 && (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onResetFilters}
        className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset
      </Button>
    )}
  </div>
);
