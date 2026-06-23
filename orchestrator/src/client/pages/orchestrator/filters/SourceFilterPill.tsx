import { Globe } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { sourceLabel } from "@/lib/utils";
import { orderedFilterSources } from "../constants";
import { FilterPill } from "./FilterPill";
import type { SourceFilterPillProps } from "./types";

export const SourceFilterPill: React.FC<SourceFilterPillProps> = ({
  sourceFilter,
  onSourceFilterChange,
  sourcesWithJobs,
}) => {
  const visibleSources = orderedFilterSources.filter((source) =>
    sourcesWithJobs.includes(source),
  );

  return (
    <FilterPill
      icon={<Globe />}
      label="Source"
      active={sourceFilter !== "all"}
      summary={sourceFilter === "all" ? null : sourceLabel[sourceFilter]}
      contentClassName="w-72"
    >
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={sourceFilter === "all" ? "default" : "outline"}
          onClick={() => onSourceFilterChange("all")}
        >
          All sources
        </Button>
        {visibleSources.map((source) => (
          <Button
            key={source}
            type="button"
            size="sm"
            variant={sourceFilter === source ? "default" : "outline"}
            onClick={() => onSourceFilterChange(source)}
          >
            {sourceLabel[source]}
          </Button>
        ))}
      </div>
    </FilterPill>
  );
};
