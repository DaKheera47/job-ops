import type { JobSource } from "@shared/types.js";
import { useMemo, useState } from "react";
import type {
  EmploymentType,
  JobDateFilter,
  JobSort,
  SalaryFilter,
  ScoreFilter,
  SponsorFilter,
} from "../constants";
import { postedWithinOptions } from "../constants";
import { sponsorOptions } from "./filterOptions";
import {
  formatSalarySummary,
  formatScoreSummary,
  getDirectionOptions,
  isSalaryFilterActive,
  isScoreFilterActive,
} from "./filterUtils";

interface UseFilterBarDerivedStateArgs {
  sourceFilter: JobSource | "all";
  sponsorFilter: SponsorFilter;
  dateFilter: JobDateFilter;
  postedWithinDays: number | null;
  employmentTypes: EmploymentType[];
  locationFilter: string;
  salaryFilter: SalaryFilter;
  scoreFilter: ScoreFilter;
  sort: JobSort;
  isFiltersOpen?: boolean;
  onFiltersOpenChange?: (open: boolean) => void;
}

export const useFilterBarDerivedState = ({
  sourceFilter,
  sponsorFilter,
  dateFilter,
  postedWithinDays,
  employmentTypes,
  locationFilter,
  salaryFilter,
  scoreFilter,
  sort,
  isFiltersOpen: isFiltersOpenProp,
  onFiltersOpenChange: onFiltersOpenChangeProp,
}: UseFilterBarDerivedStateArgs) => {
  const [internalFiltersOpen, setInternalFiltersOpen] = useState(false);
  const isFiltersOpen = isFiltersOpenProp ?? internalFiltersOpen;
  const onFiltersOpenChange = onFiltersOpenChangeProp ?? setInternalFiltersOpen;

  const salaryActive = isSalaryFilterActive(salaryFilter);
  const scoreActive = isScoreFilterActive(scoreFilter);

  const activeFilterCount = useMemo(
    () =>
      Number(sourceFilter !== "all") +
      Number(sponsorFilter !== "all") +
      Number(dateFilter.dimensions.length > 0) +
      Number(postedWithinDays != null) +
      Number(employmentTypes.length > 0) +
      Number(locationFilter.trim() !== "") +
      Number(salaryActive) +
      Number(scoreActive),
    [
      sourceFilter,
      sponsorFilter,
      dateFilter.dimensions.length,
      postedWithinDays,
      employmentTypes.length,
      locationFilter,
      salaryActive,
      scoreActive,
    ],
  );

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

  const salarySummary = formatSalarySummary(salaryFilter);
  const scoreSummary = formatScoreSummary(scoreFilter);

  return {
    isFiltersOpen,
    onFiltersOpenChange,
    salaryActive,
    scoreActive,
    activeFilterCount,
    postedWithinLabel,
    sponsorLabel,
    sortDirectionLabel,
    salarySummary,
    scoreSummary,
  };
};
