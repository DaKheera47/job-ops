import { KbdHint } from "@client/components/KbdHint";
import { Tip } from "@client/components/Tip";
import { getDisplayKey, SHORTCUTS } from "@client/lib/shortcut-map";
import { Filter, Search } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { tabs } from "../constants";
import { tabDescriptions } from "./filterOptions";
import type { OrchestratorTabRowProps } from "./types";

export const OrchestratorTabRow: React.FC<OrchestratorTabRowProps> = ({
  counts,
  onOpenCommandBar,
  isFiltersOpen,
  onFiltersOpenChange,
  activeFilterCount,
}) => {
  const commandShortcutLabel = getDisplayKey(SHORTCUTS.search);

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 lg:w-auto">
        {tabs.map((tab, index) => {
          const description = tabDescriptions[tab.id];
          const trigger = (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex-1 flex items-center lg:flex-none gap-1.5"
            >
              <KbdHint shortcut={String(index + 1)} className="mr-0.5" />
              <span>{tab.label}</span>
              {counts[tab.id] > 0 && (
                <span className="text-[10px] mt-[2px] tabular-nums opacity-60">
                  {counts[tab.id]}
                </span>
              )}
            </TabsTrigger>
          );

          if (!description) {
            return trigger;
          }

          return (
            <Tip
              key={tab.id}
              asChild
              content={<p>{description}</p>}
              contentClassName="max-w-xs text-center"
            >
              {trigger}
            </Tip>
          );
        })}
      </TabsList>

      <div className="flex items-center gap-2 self-start lg:self-auto">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={isFiltersOpen}
          aria-controls="orchestrator-filter-bar"
          onClick={() => onFiltersOpenChange(!isFiltersOpen)}
          className={cn(
            "h-8 gap-1.5 text-xs",
            isFiltersOpen && "bg-accent text-accent-foreground",
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 ? (
            <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold tabular-nums text-primary">
              {activeFilterCount}
            </span>
          ) : null}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onOpenCommandBar}
          aria-label="Search jobs"
          className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Search className="h-3.5 w-3.5" />
          Search
          <span className="rounded border border-border/70 px-1 py-0.5 font-mono text-xs leading-none text-muted-foreground">
            {commandShortcutLabel}
          </span>
        </Button>
      </div>
    </div>
  );
};
