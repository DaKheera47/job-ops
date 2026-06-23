import { KbdHint } from "@client/components/KbdHint";
import { Tip } from "@client/components/Tip";
import { getDisplayKey, SHORTCUTS } from "@client/lib/shortcut-map";
import type { JobSource } from "@shared/types.js";
import {
  ArrowDownUp,
  BadgeCheck,
  Banknote,
  Briefcase,
  CalendarDays,
  ChevronDown,
  Clock,
  Filter,
  Globe,
  MapPin,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { bucketCount, trackProductEvent } from "@/lib/analytics";
import { cn, sourceLabel } from "@/lib/utils";
import type {
  DateFilterDimension,
  DateFilterPreset,
  EmploymentType,
  FilterTab,
  JobDateFilter,
  JobSort,
  SalaryFilter,
  SalaryFilterMode,
  SponsorFilter,
} from "./constants";
import {
  dateFilterDimensionLabels,
  dateFilterDimensionOrder,
  defaultSortDirection,
  employmentTypeOptions,
  orderedFilterSources,
  postedWithinOptions,
  tabs,
} from "./constants";

interface OrchestratorFiltersProps {
  activeTab: FilterTab;
  onTabChange: (value: FilterTab) => void;
  counts: Record<FilterTab, number>;
  onOpenCommandBar: () => void;
  sourceFilter: JobSource | "all";
  onSourceFilterChange: (value: JobSource | "all") => void;
  sponsorFilter: SponsorFilter;
  onSponsorFilterChange: (value: SponsorFilter) => void;
  salaryFilter: SalaryFilter;
  onSalaryFilterChange: (value: SalaryFilter) => void;
  postedWithinDays: number | null;
  onPostedWithinChange: (value: number | null) => void;
  employmentTypes: EmploymentType[];
  onEmploymentTypesChange: (value: EmploymentType[]) => void;
  locationFilter: string;
  onLocationFilterChange: (value: string) => void;
  dateFilter: JobDateFilter;
  onDateFilterChange: (value: JobDateFilter) => void;
  sourcesWithJobs: JobSource[];
  sort: JobSort;
  onSortChange: (sort: JobSort) => void;
  onResetFilters: () => void;
  filteredCount: number;
  isFiltersOpen?: boolean;
  onFiltersOpenChange?: (open: boolean) => void;
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

const salaryModeOptions: Array<{
  value: SalaryFilterMode;
  label: string;
}> = [
  { value: "at_least", label: "at least" },
  { value: "at_most", label: "at most" },
  { value: "between", label: "between" },
];

const sortFieldOrder: JobSort["key"][] = [
  "score",
  "datePosted",
  "discoveredAt",
  "salary",
  "title",
  "employer",
];

const sortFieldLabels: Record<JobSort["key"], string> = {
  score: "Score",
  datePosted: "Posted",
  discoveredAt: "Discovered",
  salary: "Salary",
  title: "Title",
  employer: "Company",
};

const tabDescriptions: Partial<Record<FilterTab, string>> = {
  discovered: "Jobs searched, ready to be tailored",
  ready: "Jobs with tailored CVs, ready to apply",
  applied: "Jobs you've marked as applied",
};

const datePresetOptions: Array<{
  value: Exclude<DateFilterPreset, "custom">;
  label: string;
}> = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getDateRangeForPreset = (preset: Exclude<DateFilterPreset, "custom">) => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(start.getDate() - (Number.parseInt(preset, 10) - 1));

  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  };
};

const getDirectionOptions = (
  key: JobSort["key"],
): Array<{ value: JobSort["direction"]; label: string }> => {
  if (key === "datePosted" || key === "discoveredAt") {
    return [
      { value: "desc", label: "Most recent" },
      { value: "asc", label: "Least recent" },
    ];
  }
  if (key === "score" || key === "salary") {
    return [
      { value: "desc", label: "Largest first" },
      { value: "asc", label: "Smallest first" },
    ];
  }
  return [
    { value: "asc", label: "A to Z" },
    { value: "desc", label: "Z to A" },
  ];
};

const toggleDimension = (
  filter: JobDateFilter,
  dimension: DateFilterDimension,
): JobDateFilter => {
  const nextDimensions = filter.dimensions.includes(dimension)
    ? filter.dimensions.filter((value) => value !== dimension)
    : [...filter.dimensions, dimension].sort(
        (left, right) =>
          dateFilterDimensionOrder.indexOf(left) -
          dateFilterDimensionOrder.indexOf(right),
      );

  return {
    ...filter,
    dimensions: nextDimensions,
  };
};

const formatMoney = (value: number) => value.toLocaleString();

/** Trigger button shared by every filter dropdown ("faceted filter" style). */
interface FilterPillProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  /** Short value shown inline on the trigger when the filter is active. */
  summary?: string | null;
  /** Numeric badge shown when several values are selected. */
  badge?: number;
  contentClassName?: string;
  children: React.ReactNode;
}

const FilterPill: React.FC<FilterPillProps> = ({
  icon,
  label,
  active,
  summary,
  badge,
  contentClassName,
  children,
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-9 gap-1.5 rounded-full border-solid text-xs font-medium text-muted-foreground",
          active && "border-primary/50 bg-primary/5 text-foreground",
        )}
      >
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:opacity-70">
          {icon}
        </span>
        <span>{label}</span>
        {summary ? (
          <span className="max-w-[10rem] truncate font-semibold text-foreground">
            {summary}
          </span>
        ) : null}
        {typeof badge === "number" && badge > 0 ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold tabular-nums text-primary">
            {badge}
          </span>
        ) : null}
        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className={cn("w-64", contentClassName)}>
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {children}
      </div>
    </PopoverContent>
  </Popover>
);

export const OrchestratorFilters: React.FC<OrchestratorFiltersProps> = ({
  activeTab,
  onTabChange,
  counts,
  onOpenCommandBar,
  sourceFilter,
  onSourceFilterChange,
  sponsorFilter,
  onSponsorFilterChange,
  salaryFilter,
  onSalaryFilterChange,
  postedWithinDays,
  onPostedWithinChange,
  employmentTypes,
  onEmploymentTypesChange,
  locationFilter,
  onLocationFilterChange,
  dateFilter,
  onDateFilterChange,
  sourcesWithJobs,
  sort,
  onSortChange,
  onResetFilters,
  filteredCount,
  isFiltersOpen: isFiltersOpenProp,
  onFiltersOpenChange: onFiltersOpenChangeProp,
}) => {
  const [internalFiltersOpen, setInternalFiltersOpen] = useState(false);
  const isFiltersOpen = isFiltersOpenProp ?? internalFiltersOpen;
  const onFiltersOpenChange = onFiltersOpenChangeProp ?? setInternalFiltersOpen;

  const visibleSources = orderedFilterSources.filter((source) =>
    sourcesWithJobs.includes(source),
  );

  const salaryActive =
    (typeof salaryFilter.min === "number" && salaryFilter.min > 0) ||
    (typeof salaryFilter.max === "number" && salaryFilter.max > 0);

  const activeFilterCount = useMemo(
    () =>
      Number(sourceFilter !== "all") +
      Number(sponsorFilter !== "all") +
      Number(dateFilter.dimensions.length > 0) +
      Number(postedWithinDays != null) +
      Number(employmentTypes.length > 0) +
      Number(locationFilter.trim() !== "") +
      Number(salaryActive),
    [
      sourceFilter,
      sponsorFilter,
      dateFilter.dimensions.length,
      postedWithinDays,
      employmentTypes.length,
      locationFilter,
      salaryActive,
    ],
  );

  const showSalaryMin =
    salaryFilter.mode === "at_least" || salaryFilter.mode === "between";
  const showSalaryMax =
    salaryFilter.mode === "at_most" || salaryFilter.mode === "between";
  const commandShortcutLabel = getDisplayKey(SHORTCUTS.search);

  const postedWithinLabel =
    postedWithinOptions.find((option) => option.value === postedWithinDays)
      ?.label ?? null;
  const sponsorLabel =
    sponsorFilter === "all"
      ? null
      : (sponsorOptions.find((option) => option.value === sponsorFilter)
          ?.label ?? null);
  const sortDirectionLabel = getDirectionOptions(sort.key).find(
    (option) => option.value === sort.direction,
  )?.label;

  let salarySummary: string | null = null;
  if (salaryActive) {
    if (salaryFilter.mode === "between") {
      salarySummary = `${salaryFilter.min ? formatMoney(salaryFilter.min) : "0"}–${
        salaryFilter.max ? formatMoney(salaryFilter.max) : "∞"
      }`;
    } else if (salaryFilter.mode === "at_most" && salaryFilter.max) {
      salarySummary = `≤ ${formatMoney(salaryFilter.max)}`;
    } else if (salaryFilter.min) {
      salarySummary = `≥ ${formatMoney(salaryFilter.min)}`;
    }
  }

  const applySortChange = (nextSort: JobSort) => {
    if (nextSort.key === sort.key && nextSort.direction === sort.direction) {
      return;
    }

    trackProductEvent("jobs_sort_changed", {
      sort_key: nextSort.key,
      sort_direction: nextSort.direction,
      previous_sort_key: sort.key,
      previous_sort_direction: sort.direction,
      tab: activeTab,
      filtered_count_bucket: bucketCount(filteredCount),
    });
    onSortChange(nextSort);
  };

  const clearDateFilter = () =>
    onDateFilterChange({
      dimensions: [],
      startDate: null,
      endDate: null,
      preset: null,
    });

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as FilterTab)}
    >
      <div className="space-y-3">
        {/* Row 1: tabs + search */}
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
              variant="outline"
              size="sm"
              aria-expanded={isFiltersOpen}
              aria-controls="orchestrator-filter-bar"
              onClick={() => onFiltersOpenChange(!isFiltersOpen)}
              className="h-8 gap-1.5 text-xs"
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

        {isFiltersOpen ? (
          <div
            id="orchestrator-filter-bar"
            className="flex flex-wrap items-center gap-2"
          >
            {/* Location — live inline input, no extra click needed */}
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Filter by location"
                value={locationFilter}
                onChange={(event) => onLocationFilterChange(event.target.value)}
                placeholder="Location"
                className={cn(
                  "h-9 w-[180px] rounded-full pl-8 text-xs",
                  locationFilter.trim() && "pr-8",
                )}
              />
              {locationFilter.trim() ? (
                <button
                  type="button"
                  aria-label="Clear location"
                  onClick={() => onLocationFilterChange("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            <FilterPill
              icon={<Globe />}
              label="Source"
              active={sourceFilter !== "all"}
              summary={
                sourceFilter === "all" ? null : sourceLabel[sourceFilter]
              }
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

            <FilterPill
              icon={<Clock />}
              label="Posted"
              active={postedWithinDays != null}
              summary={postedWithinLabel}
            >
              <div className="flex flex-wrap gap-2">
                {postedWithinOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={
                      postedWithinDays === option.value ? "default" : "outline"
                    }
                    onClick={() =>
                      onPostedWithinChange(
                        postedWithinDays === option.value ? null : option.value,
                      )
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </FilterPill>

            <FilterPill
              icon={<Briefcase />}
              label="Employment"
              active={employmentTypes.length > 0}
              badge={employmentTypes.length}
            >
              <div className="space-y-2">
                {employmentTypeOptions.map((option) => {
                  const checked = employmentTypes.includes(option.value);
                  const inputId = `employment-${option.value}`;
                  return (
                    <label
                      key={option.value}
                      htmlFor={inputId}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={(next) => {
                          const isChecked = next === true;
                          onEmploymentTypesChange(
                            isChecked
                              ? [...employmentTypes, option.value]
                              : employmentTypes.filter(
                                  (type) => type !== option.value,
                                ),
                          );
                        }}
                      />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </div>
            </FilterPill>

            <FilterPill
              icon={<CalendarDays />}
              label="Dates"
              active={dateFilter.dimensions.length > 0}
              badge={dateFilter.dimensions.length}
              contentClassName="w-80"
            >
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {dateFilterDimensionOrder.map((dimension) => (
                    <Button
                      key={dimension}
                      type="button"
                      size="sm"
                      variant={
                        dateFilter.dimensions.includes(dimension)
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        onDateFilterChange(
                          toggleDimension(dateFilter, dimension),
                        )
                      }
                    >
                      {dateFilterDimensionLabels[dimension]}
                    </Button>
                  ))}
                </div>

                {dateFilter.dimensions.length > 0 && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {datePresetOptions.map((option) => (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant={
                            dateFilter.preset === option.value
                              ? "default"
                              : "outline"
                          }
                          onClick={() =>
                            onDateFilterChange({
                              ...dateFilter,
                              preset: option.value,
                              ...getDateRangeForPreset(option.value),
                            })
                          }
                        >
                          Last {option.label}
                        </Button>
                      ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="date-start-filter">Start date</Label>
                        <Input
                          id="date-start-filter"
                          type="date"
                          value={dateFilter.startDate ?? ""}
                          onChange={(event) =>
                            onDateFilterChange({
                              ...dateFilter,
                              startDate: event.target.value || null,
                              preset: "custom",
                            })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="date-end-filter">End date</Label>
                        <Input
                          id="date-end-filter"
                          type="date"
                          value={dateFilter.endDate ?? ""}
                          onChange={(event) =>
                            onDateFilterChange({
                              ...dateFilter,
                              endDate: event.target.value || null,
                              preset: "custom",
                            })
                          }
                        />
                      </div>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={clearDateFilter}
                    >
                      Clear date filters
                    </Button>
                  </>
                )}
              </div>
            </FilterPill>

            <FilterPill
              icon={<BadgeCheck />}
              label="Sponsor"
              active={sponsorFilter !== "all"}
              summary={sponsorLabel}
              contentClassName="w-72"
            >
              <div className="flex flex-wrap gap-2">
                {sponsorOptions.map((option) => (
                  <Button
                    key={option.value}
                    type="button"
                    size="sm"
                    variant={
                      sponsorFilter === option.value ? "default" : "outline"
                    }
                    onClick={() => onSponsorFilterChange(option.value)}
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </FilterPill>

            <FilterPill
              icon={<Banknote />}
              label="Salary"
              active={salaryActive}
              summary={salarySummary}
            >
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Salary is</span>
                  <Select
                    value={salaryFilter.mode}
                    onValueChange={(value) => {
                      const nextMode = value as SalaryFilterMode;
                      if (nextMode === "at_least") {
                        onSalaryFilterChange({
                          mode: nextMode,
                          min: salaryFilter.min,
                          max: null,
                        });
                        return;
                      }
                      if (nextMode === "at_most") {
                        onSalaryFilterChange({
                          mode: nextMode,
                          min: null,
                          max: salaryFilter.max,
                        });
                        return;
                      }
                      onSalaryFilterChange({
                        mode: nextMode,
                        min: salaryFilter.min,
                        max: salaryFilter.max,
                      });
                    }}
                  >
                    <SelectTrigger
                      id="salary-mode"
                      aria-label="Salary range specifier"
                      className="h-8 w-[140px] text-foreground"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {salaryModeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {showSalaryMin && (
                    <div className="space-y-1">
                      <Label htmlFor="salary-min-filter">Minimum</Label>
                      <Input
                        id="salary-min-filter"
                        value={
                          salaryFilter.min == null
                            ? ""
                            : String(salaryFilter.min)
                        }
                        onChange={(event) => {
                          const raw = event.target.value.trim();
                          const parsed = Number.parseInt(raw, 10);
                          onSalaryFilterChange({
                            ...salaryFilter,
                            min:
                              Number.isFinite(parsed) && parsed > 0
                                ? parsed
                                : null,
                          });
                        }}
                        inputMode="numeric"
                        placeholder="e.g. 60000"
                      />
                    </div>
                  )}

                  {showSalaryMax && (
                    <div className="space-y-1">
                      <Label htmlFor="salary-max-filter">Maximum</Label>
                      <Input
                        id="salary-max-filter"
                        value={
                          salaryFilter.max == null
                            ? ""
                            : String(salaryFilter.max)
                        }
                        onChange={(event) => {
                          const raw = event.target.value.trim();
                          const parsed = Number.parseInt(raw, 10);
                          onSalaryFilterChange({
                            ...salaryFilter,
                            max:
                              Number.isFinite(parsed) && parsed > 0
                                ? parsed
                                : null,
                          });
                        }}
                        inputMode="numeric"
                        placeholder="e.g. 100000"
                      />
                    </div>
                  )}
                </div>
              </div>
            </FilterPill>

            <span className="mx-1 h-6 w-px bg-border" aria-hidden="true" />

            <FilterPill
              icon={<ArrowDownUp />}
              label="Sort"
              active={false}
              summary={`${sortFieldLabels[sort.key]}${
                sortDirectionLabel ? ` · ${sortDirectionLabel}` : ""
              }`}
              contentClassName="w-64"
            >
              <div className="space-y-3 text-sm text-muted-foreground">
                <div className="space-y-1">
                  <span>Sort by</span>
                  <Select
                    value={sort.key}
                    onValueChange={(value) =>
                      applySortChange({
                        key: value as JobSort["key"],
                        direction:
                          defaultSortDirection[value as JobSort["key"]],
                      })
                    }
                  >
                    <SelectTrigger
                      id="sort-key"
                      aria-label="Sort field"
                      className="h-8 w-full text-foreground"
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
                </div>

                <div className="space-y-1">
                  <span>Direction</span>
                  <Select
                    value={sort.direction}
                    onValueChange={(value) =>
                      applySortChange({
                        ...sort,
                        direction: value as JobSort["direction"],
                      })
                    }
                  >
                    <SelectTrigger
                      id="sort-direction"
                      aria-label="Sort order"
                      className="h-8 w-full text-foreground"
                    >
                      <SelectValue placeholder={sortDirectionLabel} />
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
              </div>
            </FilterPill>

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
        ) : null}
      </div>
    </Tabs>
  );
};
