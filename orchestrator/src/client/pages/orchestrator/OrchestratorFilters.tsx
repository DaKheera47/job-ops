import type { JobSource } from "@shared/types.js";
import { Filter, Search } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { sourceLabel } from "@/lib/utils";
import type { FilterTab, JobSort, SponsorFilter } from "./constants";
import {
  defaultSortDirection,
  orderedFilterSources,
  tabs,
} from "./constants";

interface OrchestratorFiltersProps {
  activeTab: FilterTab;
  onTabChange: (value: FilterTab) => void;
  counts: Record<FilterTab, number>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  sourceFilter: JobSource | "all";
  onSourceFilterChange: (value: JobSource | "all") => void;
  sponsorFilter: SponsorFilter;
  onSponsorFilterChange: (value: SponsorFilter) => void;
  minSalary: number | null;
  onMinSalaryChange: (value: number | null) => void;
  sourcesWithJobs: JobSource[];
  sort: JobSort;
  onSortChange: (sort: JobSort) => void;
  onResetFilters: () => void;
  filteredCount: number;
}

const sponsorOptions: Array<{
  value: SponsorFilter;
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "confirmed", label: "Confirmed sponsor" },
  { value: "potential", label: "Potential sponsor" },
  { value: "not_found", label: "Sponsor not found" },
  { value: "unknown", label: "Unchecked sponsor" },
];

const sortFieldOrder: JobSort["key"][] = [
  "score",
  "discoveredAt",
  "salary",
  "title",
  "employer",
];

const sortFieldLabels: Record<JobSort["key"], string> = {
  score: "match score",
  discoveredAt: "date discovered",
  salary: "salary",
  title: "job title",
  employer: "company",
};

const getDirectionOptions = (
  key: JobSort["key"],
): Array<{ value: JobSort["direction"]; label: string }> => {
  if (key === "discoveredAt") {
    return [
      { value: "desc", label: "newest first" },
      { value: "asc", label: "oldest first" },
    ];
  }
  if (key === "score" || key === "salary") {
    return [
      { value: "desc", label: "largest first" },
      { value: "asc", label: "smallest first" },
    ];
  }
  return [
    { value: "asc", label: "A to Z" },
    { value: "desc", label: "Z to A" },
  ];
};

export const OrchestratorFilters: React.FC<OrchestratorFiltersProps> = ({
  activeTab,
  onTabChange,
  counts,
  searchQuery,
  onSearchQueryChange,
  sourceFilter,
  onSourceFilterChange,
  sponsorFilter,
  onSponsorFilterChange,
  minSalary,
  onMinSalaryChange,
  sourcesWithJobs,
  sort,
  onSortChange,
  onResetFilters,
  filteredCount,
}) => {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const visibleSources = orderedFilterSources.filter((source) =>
    sourcesWithJobs.includes(source),
  );

  const activeFilterCount = useMemo(
    () =>
      Number(sourceFilter !== "all") +
      Number(sponsorFilter !== "all") +
      Number(typeof minSalary === "number" && minSalary > 0),
    [sourceFilter, sponsorFilter, minSalary],
  );

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as FilterTab)}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 lg:w-auto">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex-1 flex items-center lg:flex-none gap-1.5"
            >
              <span>{tab.label}</span>
              {counts[tab.id] > 0 && (
                <span className="text-[10px] mt-[2px] tabular-nums opacity-60">
                  {counts[tab.id]}
                </span>
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

          <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground w-auto"
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold tabular-nums text-primary">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </SheetTrigger>

            <SheetContent side="right" className="w-full sm:max-w-2xl">
              <div className="flex h-full min-h-0 flex-col">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1 text-[11px] font-semibold tabular-nums text-primary">
                        {activeFilterCount}
                      </span>
                    )}
                  </SheetTitle>
                  <SheetDescription>
                    Refine sources, sponsor status, salary, and sorting.
                  </SheetDescription>
                </SheetHeader>

                <Separator className="my-4" />

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Sources</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
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
                          variant={
                            sourceFilter === source ? "default" : "outline"
                          }
                          onClick={() => onSourceFilterChange(source)}
                        >
                          {sourceLabel[source]}
                        </Button>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Sponsor status</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-wrap gap-2">
                      {sponsorOptions.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant={
                            sponsorFilter === option.value
                              ? "default"
                              : "outline"
                          }
                          onClick={() => onSponsorFilterChange(option.value)}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Minimum salary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Label htmlFor="min-salary-filter">Minimum salary</Label>
                      <Input
                        id="min-salary-filter"
                        className="mt-2"
                        value={minSalary == null ? "" : String(minSalary)}
                        onChange={(event) => {
                          const rawValue = event.target.value.trim();
                          if (!rawValue) {
                            onMinSalaryChange(null);
                            return;
                          }
                          const parsed = Number.parseInt(rawValue, 10);
                          onMinSalaryChange(
                            Number.isFinite(parsed) && parsed > 0
                              ? parsed
                              : null,
                          );
                        }}
                        inputMode="numeric"
                        placeholder="e.g. 60000"
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle>Sort</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span>Sort by</span>
                        <Select
                          value={sort.key}
                          onValueChange={(value) =>
                            onSortChange({
                              key: value as JobSort["key"],
                              direction:
                                defaultSortDirection[value as JobSort["key"]],
                            })
                          }
                        >
                          <SelectTrigger
                            id="sort-key"
                            aria-label="Sort field"
                            className="h-8 w-[180px] text-foreground"
                          >
                            <SelectValue placeholder={sortFieldLabels[sort.key]} />
                          </SelectTrigger>
                          <SelectContent>
                            {sortFieldOrder.map((key) => (
                              <SelectItem key={key} value={key}>
                                {sortFieldLabels[key]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={sort.direction}
                          onValueChange={(value) =>
                            onSortChange({
                              ...sort,
                              direction: value as JobSort["direction"],
                            })
                          }
                        >
                          <SelectTrigger
                            id="sort-direction"
                            aria-label="Sort order"
                            className="h-8 w-[180px] text-foreground"
                          >
                            <SelectValue
                              placeholder={
                                getDirectionOptions(sort.key).find(
                                  (option) => option.value === sort.direction,
                                )?.label
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            {getDirectionOptions(sort.key).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="mt-3 flex shrink-0 items-center justify-between border-t border-border/60 bg-background pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onResetFilters}
                  >
                    Reset
                  </Button>
                  <Button type="button" onClick={() => setIsDrawerOpen(false)}>
                    Show {filteredCount.toLocaleString()}{" "}
                    {filteredCount === 1 ? "job" : "jobs"}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </Tabs>
  );
};
