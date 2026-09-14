import type { JobSource } from "@shared/types.js";
import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  DateFilterDimension,
  DateFilterPreset,
  EmploymentType,
  JobDateFilter,
  JobSort,
  SalaryFilter,
  SalaryFilterMode,
  ScoreFilter,
  ScoreFilterMode,
  SponsorFilter,
} from "./constants";
import {
  DEFAULT_SORT,
  dateFilterDimensionOrder,
  employmentTypeValues,
  postedWithinValues,
} from "./constants";

const allowedSponsorFilters: SponsorFilter[] = [
  "all",
  "confirmed",
  "potential",
  "not_found",
  "unknown",
];
const allowedSalaryModes: SalaryFilterMode[] = [
  "at_least",
  "at_most",
  "between",
];
const allowedScoreModes: ScoreFilterMode[] = ["any", "has", "missing"];
const clampScoreValue = (value: number): number =>
  Math.min(100, Math.max(0, value));
const allowedSortKeys: JobSort["key"][] = [
  "datePosted",
  "discoveredAt",
  "score",
  "salary",
  "title",
  "employer",
];
const allowedSortDirections: JobSort["direction"][] = ["asc", "desc"];
const allowedDateFilterPresets: DateFilterPreset[] = [
  "7",
  "14",
  "30",
  "90",
  "custom",
];

const isValidDateInput = (value: string | null): value is string =>
  value != null && /^\d{4}-\d{2}-\d{2}$/.test(value);

const parseDateDimensions = (value: string | null): DateFilterDimension[] => {
  if (!value) return [];

  const seen = new Set<DateFilterDimension>();

  for (const token of value.split(",")) {
    if (!dateFilterDimensionOrder.includes(token as DateFilterDimension)) {
      continue;
    }
    seen.add(token as DateFilterDimension);
  }

  return dateFilterDimensionOrder.filter((dimension) => seen.has(dimension));
};

const parseEmploymentTypes = (value: string | null): EmploymentType[] => {
  if (!value) return [];

  const seen = new Set<EmploymentType>();
  for (const token of value.split(",")) {
    if (employmentTypeValues.includes(token as EmploymentType)) {
      seen.add(token as EmploymentType);
    }
  }

  return employmentTypeValues.filter((type) => seen.has(type));
};

export const useOrchestratorFilters = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!searchParams.has("q")) return;
    setSearchParams(
      (prev) => {
        prev.delete("q");
        return prev;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  const sourceFilter =
    (searchParams.get("source") as JobSource | "all") || "all";
  const setSourceFilter = useCallback(
    (source: JobSource | "all") => {
      setSearchParams(
        (prev) => {
          if (source !== "all") prev.set("source", source);
          else prev.delete("source");
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const sponsorFilter = useMemo((): SponsorFilter => {
    const raw = searchParams.get("sponsor") ?? "all";
    return allowedSponsorFilters.includes(raw as SponsorFilter)
      ? (raw as SponsorFilter)
      : "all";
  }, [searchParams]);

  const setSponsorFilter = useCallback(
    (value: SponsorFilter) => {
      setSearchParams(
        (prev) => {
          if (value === "all") prev.delete("sponsor");
          else prev.set("sponsor", value);
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const salaryFilter = useMemo((): SalaryFilter => {
    const modeRaw = searchParams.get("salaryMode") ?? "at_least";
    const mode = allowedSalaryModes.includes(modeRaw as SalaryFilterMode)
      ? (modeRaw as SalaryFilterMode)
      : "at_least";

    const minRaw =
      searchParams.get("salaryMin") ?? searchParams.get("minSalary");
    const minParsed = minRaw == null ? Number.NaN : Number.parseInt(minRaw, 10);
    const min = Number.isFinite(minParsed) && minParsed > 0 ? minParsed : null;

    const maxRaw = searchParams.get("salaryMax");
    const maxParsed = maxRaw == null ? Number.NaN : Number.parseInt(maxRaw, 10);
    const max = Number.isFinite(maxParsed) && maxParsed > 0 ? maxParsed : null;

    return { mode, min, max };
  }, [searchParams]);

  const setSalaryFilter = useCallback(
    (value: SalaryFilter) => {
      setSearchParams(
        (prev) => {
          if (value.mode === "at_least") prev.delete("salaryMode");
          else prev.set("salaryMode", value.mode);

          if (value.min == null || value.min <= 0) prev.delete("salaryMin");
          else prev.set("salaryMin", String(value.min));

          if (value.max == null || value.max <= 0) prev.delete("salaryMax");
          else prev.set("salaryMax", String(value.max));

          prev.delete("minSalary");
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const scoreFilter = useMemo((): ScoreFilter => {
    const modeRaw = searchParams.get("scoreMode") ?? "any";
    const mode = allowedScoreModes.includes(modeRaw as ScoreFilterMode)
      ? (modeRaw as ScoreFilterMode)
      : "any";

    const minRaw = searchParams.get("scoreMin");
    const minParsed = minRaw == null ? Number.NaN : Number.parseInt(minRaw, 10);
    const min = Number.isFinite(minParsed) ? clampScoreValue(minParsed) : null;

    const maxRaw = searchParams.get("scoreMax");
    const maxParsed = maxRaw == null ? Number.NaN : Number.parseInt(maxRaw, 10);
    const max = Number.isFinite(maxParsed) ? clampScoreValue(maxParsed) : null;

    return { mode, min, max };
  }, [searchParams]);

  const setScoreFilter = useCallback(
    (value: ScoreFilter) => {
      setSearchParams(
        (prev) => {
          if (value.mode === "any") prev.delete("scoreMode");
          else prev.set("scoreMode", value.mode);

          if (value.min == null) prev.delete("scoreMin");
          else prev.set("scoreMin", String(clampScoreValue(value.min)));

          if (value.max == null) prev.delete("scoreMax");
          else prev.set("scoreMax", String(clampScoreValue(value.max)));

          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const postedWithinDays = useMemo((): number | null => {
    const raw = searchParams.get("postedWithin");
    if (!raw) return null;
    const parsed = Number.parseInt(raw, 10);
    return postedWithinValues.includes(parsed) ? parsed : null;
  }, [searchParams]);

  const setPostedWithinDays = useCallback(
    (value: number | null) => {
      setSearchParams(
        (prev) => {
          if (value == null) prev.delete("postedWithin");
          else prev.set("postedWithin", String(value));
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const employmentTypes = useMemo(
    (): EmploymentType[] =>
      parseEmploymentTypes(searchParams.get("employment")),
    [searchParams],
  );

  const setEmploymentTypes = useCallback(
    (values: EmploymentType[]) => {
      const normalized = employmentTypeValues.filter((type) =>
        values.includes(type),
      );
      setSearchParams(
        (prev) => {
          if (normalized.length === 0) prev.delete("employment");
          else prev.set("employment", normalized.join(","));
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const location = searchParams.get("location") ?? "";
  const setLocation = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => {
          // Keep the raw value (incl. spaces) so multi-word locations like
          // "new york" remain typeable; only drop the param when it is blank.
          if (!value.trim()) prev.delete("location");
          else prev.set("location", value);
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const sort = useMemo((): JobSort => {
    const sortValue = searchParams.get("sort");
    if (!sortValue) return DEFAULT_SORT;

    const [key, direction] = sortValue.split("-");
    if (
      !allowedSortKeys.includes(key as JobSort["key"]) ||
      !allowedSortDirections.includes(direction as JobSort["direction"])
    ) {
      return DEFAULT_SORT;
    }

    return {
      key: key as JobSort["key"],
      direction: direction as JobSort["direction"],
    };
  }, [searchParams]);

  const dateFilter = useMemo((): JobDateFilter => {
    const startDateRaw = searchParams.get("appliedStart");
    const endDateRaw = searchParams.get("appliedEnd");
    const startDate = isValidDateInput(startDateRaw) ? startDateRaw : null;
    const endDate = isValidDateInput(endDateRaw) ? endDateRaw : null;

    const presetRaw = searchParams.get("appliedRange");
    const preset = allowedDateFilterPresets.includes(
      presetRaw as DateFilterPreset,
    )
      ? (presetRaw as DateFilterPreset)
      : null;

    const dimensions = parseDateDimensions(searchParams.get("date"));

    return {
      dimensions,
      startDate,
      endDate,
      preset,
    };
  }, [searchParams]);

  const setSort = useCallback(
    (newSort: JobSort) => {
      setSearchParams(
        (prev) => {
          if (
            newSort.key === DEFAULT_SORT.key &&
            newSort.direction === DEFAULT_SORT.direction
          ) {
            prev.delete("sort");
          } else {
            prev.set("sort", `${newSort.key}-${newSort.direction}`);
          }
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setDateFilter = useCallback(
    (value: JobDateFilter) => {
      setSearchParams(
        (prev) => {
          if (value.dimensions.length === 0) prev.delete("date");
          else prev.set("date", value.dimensions.join(","));

          if (value.startDate == null) prev.delete("appliedStart");
          else prev.set("appliedStart", value.startDate);

          if (value.endDate == null) prev.delete("appliedEnd");
          else prev.set("appliedEnd", value.endDate);

          if (value.preset == null) prev.delete("appliedRange");
          else prev.set("appliedRange", value.preset);

          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const resetFilters = useCallback(() => {
    setSearchParams(
      (prev) => {
        prev.delete("source");
        prev.delete("sponsor");
        prev.delete("salaryMode");
        prev.delete("salaryMin");
        prev.delete("salaryMax");
        prev.delete("minSalary");
        prev.delete("scoreMode");
        prev.delete("scoreMin");
        prev.delete("scoreMax");
        prev.delete("postedWithin");
        prev.delete("employment");
        prev.delete("location");
        prev.delete("sort");
        prev.delete("date");
        prev.delete("appliedStart");
        prev.delete("appliedEnd");
        prev.delete("appliedRange");
        return prev;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return {
    searchParams,
    sourceFilter,
    setSourceFilter,
    sponsorFilter,
    setSponsorFilter,
    salaryFilter,
    setSalaryFilter,
    scoreFilter,
    setScoreFilter,
    postedWithinDays,
    setPostedWithinDays,
    employmentTypes,
    setEmploymentTypes,
    location,
    setLocation,
    dateFilter,
    setDateFilter,
    sort,
    setSort,
    resetFilters,
  };
};
