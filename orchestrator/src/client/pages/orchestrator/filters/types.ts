import type { JobSource } from "@shared/types.js";
import type React from "react";
import type {
  EmploymentType,
  FilterTab,
  JobDateFilter,
  JobSort,
  SalaryFilter,
  SponsorFilter,
} from "../constants";

export interface OrchestratorFiltersProps {
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

export type LocationFilterInputProps = Pick<
  OrchestratorFiltersProps,
  "locationFilter" | "onLocationFilterChange"
>;

export type SourceFilterPillProps = Pick<
  OrchestratorFiltersProps,
  "sourceFilter" | "onSourceFilterChange" | "sourcesWithJobs"
>;

export type PostedWithinFilterPillProps = Pick<
  OrchestratorFiltersProps,
  "postedWithinDays" | "onPostedWithinChange"
> & {
  postedWithinLabel: string | null;
};

export type EmploymentTypeFilterPillProps = Pick<
  OrchestratorFiltersProps,
  "employmentTypes" | "onEmploymentTypesChange"
>;

export type DateFilterPillProps = Pick<
  OrchestratorFiltersProps,
  "dateFilter" | "onDateFilterChange"
>;

export type SponsorFilterPillProps = Pick<
  OrchestratorFiltersProps,
  "sponsorFilter" | "onSponsorFilterChange"
> & {
  sponsorLabel: string | null;
};

export type SalaryFilterPillProps = Pick<
  OrchestratorFiltersProps,
  "salaryFilter" | "onSalaryFilterChange"
> & {
  salaryActive: boolean;
  salarySummary: string | null;
};

export type SortFilterPillProps = Pick<
  OrchestratorFiltersProps,
  "activeTab" | "sort" | "onSortChange" | "filteredCount"
> & {
  sortDirectionLabel: string | undefined;
};

export type OrchestratorTabRowProps = Pick<
  OrchestratorFiltersProps,
  "counts" | "onOpenCommandBar"
> & {
  isFiltersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  activeFilterCount: number;
};

export type OrchestratorFilterBarProps = Pick<
  OrchestratorFiltersProps,
  "onResetFilters"
> & {
  activeFilterCount: number;
  children: React.ReactNode;
};
