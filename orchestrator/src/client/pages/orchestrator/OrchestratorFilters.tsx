import React from "react";
import { ArrowUpDown, Filter, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { sourceLabel } from "@/lib/utils";
import type { JobSource } from "../../../shared/types";
import { defaultSortDirection, sortLabels, tabs } from "./constants";
import type { FilterTab, JobSort } from "./constants";

interface OrchestratorFiltersProps {
  activeTab: FilterTab;
  onTabChange: (value: FilterTab) => void;
  counts: Record<FilterTab, number>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  sourceFilter: JobSource | "all";
  onSourceFilterChange: (value: JobSource | "all") => void;
  sort: JobSort;
  onSortChange: (sort: JobSort) => void;
}

export const OrchestratorFilters: React.FC<OrchestratorFiltersProps> = ({
  activeTab,
  onTabChange,
  counts,
  searchQuery,
  onSearchQueryChange,
  sourceFilter,
  onSourceFilterChange,
  sort,
  onSortChange,
}) => (
  <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as FilterTab)}>
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 lg:w-auto">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="flex-1 flex items-center lg:flex-none gap-1.5">
            <span>{tab.label}</span>
            {counts[tab.id] > 0 && (
              <span className="text-[10px] mt-[2px] tabular-nums opacity-60">{counts[tab.id]}</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="flex lg:flex-nowrap flex-wrap items-center justify-end gap-2">
        <div className="relative w-full flex-1 min-w-[180px] lg:max-w-[240px] lg:flex-none">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <Input
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search..."
            className="h-8 pl-8 text-sm"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground w-auto"
            >
              <Filter className="h-3.5 w-3.5" />
              {sourceFilter === "all" ? "All sources" : sourceLabel[sourceFilter]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Filter by source</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sourceFilter}
              onValueChange={(value) => onSourceFilterChange(value as JobSource | "all")}
            >
              <DropdownMenuRadioItem value="all">All Sources</DropdownMenuRadioItem>
              {(Object.keys(sourceLabel) as JobSource[]).map((key) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  {sourceLabel[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground w-auto"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortLabels[sort.key]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Sort by</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sort.key}
              onValueChange={(value) =>
                onSortChange({
                  key: value as JobSort["key"],
                  direction: defaultSortDirection[value as JobSort["key"]],
                })
              }
            >
              {(Object.keys(sortLabels) as Array<JobSort["key"]>).map((key) => (
                <DropdownMenuRadioItem key={key} value={key}>
                  {sortLabels[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                onSortChange({
                  ...sort,
                  direction: sort.direction === "asc" ? "desc" : "asc",
                })
              }
            >
              Direction: {sort.direction === "asc" ? "Ascending" : "Descending"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  </Tabs>
);
