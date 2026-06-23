import type {
  DateFilterDimension,
  DateFilterPreset,
  JobDateFilter,
  JobSort,
  SalaryFilter,
} from "../constants";
import { dateFilterDimensionOrder } from "../constants";

export const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const getDateRangeForPreset = (
  preset: Exclude<DateFilterPreset, "custom">,
) => {
  const end = new Date();
  end.setHours(0, 0, 0, 0);

  const start = new Date(end);
  start.setDate(start.getDate() - (Number.parseInt(preset, 10) - 1));

  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end),
  };
};

export const getDirectionOptions = (
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

export const toggleDimension = (
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

export const formatMoney = (value: number) => value.toLocaleString();

export const isSalaryFilterActive = (salaryFilter: SalaryFilter) =>
  (typeof salaryFilter.min === "number" && salaryFilter.min > 0) ||
  (typeof salaryFilter.max === "number" && salaryFilter.max > 0);

export const formatSalarySummary = (
  salaryFilter: SalaryFilter,
): string | null => {
  if (!isSalaryFilterActive(salaryFilter)) {
    return null;
  }

  if (salaryFilter.mode === "between") {
    return `${salaryFilter.min ? formatMoney(salaryFilter.min) : "0"}–${
      salaryFilter.max ? formatMoney(salaryFilter.max) : "∞"
    }`;
  }
  if (salaryFilter.mode === "at_most" && salaryFilter.max) {
    return `≤ ${formatMoney(salaryFilter.max)}`;
  }
  if (salaryFilter.min) {
    return `≥ ${formatMoney(salaryFilter.min)}`;
  }
  return null;
};
