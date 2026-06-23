import type {
  DateFilterPreset,
  FilterTab,
  JobSort,
  SalaryFilterMode,
  SponsorFilter,
} from "../constants";

export const sponsorOptions: Array<{
  value: SponsorFilter;
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "confirmed", label: "Confirmed sponsor" },
  { value: "potential", label: "Potential sponsor" },
  { value: "not_found", label: "Sponsor not found" },
  { value: "unknown", label: "Unchecked sponsor" },
];

export const salaryModeOptions: Array<{
  value: SalaryFilterMode;
  label: string;
}> = [
  { value: "at_least", label: "at least" },
  { value: "at_most", label: "at most" },
  { value: "between", label: "between" },
];

export const sortFieldOrder: JobSort["key"][] = [
  "score",
  "datePosted",
  "discoveredAt",
  "salary",
  "title",
  "employer",
];

export const tabDescriptions: Partial<Record<FilterTab, string>> = {
  discovered: "Jobs searched, ready to be tailored",
  ready: "Jobs with tailored CVs, ready to apply",
  applied: "Jobs you've marked as applied",
};

export const datePresetOptions: Array<{
  value: Exclude<DateFilterPreset, "custom">;
  label: string;
}> = [
  { value: "7", label: "7 days" },
  { value: "14", label: "14 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];
