import { EXTRACTOR_SOURCE_METADATA } from "@shared/extractors";
import {
  createLocationIntent,
  type LocationSourcePlan,
  planLocationSources,
} from "@shared/location-intelligence.js";
import type {
  LocationMatchStrictness,
  LocationSearchScope,
} from "@shared/location-preferences.js";
import {
  formatCountryLabel,
  normalizeCountryKey,
  SUPPORTED_COUNTRY_KEYS,
} from "@shared/location-support.js";
import type { AppSettings, JobSource } from "@shared/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Info, Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { Separator } from "@/components/ui/separator";
import { getDetectedCountryKey } from "@/lib/user-location";
import { sourceLabel } from "@/lib/utils";
import {
  AUTOMATIC_PRESETS,
  type AutomaticPresetId,
  type AutomaticPresetSelection,
  type AutomaticRunValues,
  calculateAutomaticEstimate,
  loadAutomaticRunMemory,
  MATCH_STRICTNESS_OPTIONS,
  normalizeWorkplaceTypes,
  parseCityLocationsInput,
  parseCityLocationsSetting,
  parseSearchTermsInput,
  SEARCH_SCOPE_OPTIONS,
  saveAutomaticRunMemory,
  summarizeLocationPreferences,
  WORKPLACE_TYPE_OPTIONS,
  type WorkplaceType,
} from "./automatic-run";
import { TokenizedInput } from "./TokenizedInput";

interface AutomaticRunTabProps {
  open: boolean;
  settings: AppSettings | null;
  enabledSources: JobSource[];
  pipelineSources: JobSource[];
  onToggleSource: (source: JobSource, checked: boolean) => void;
  onSetPipelineSources: (sources: JobSource[]) => void;
  isPipelineRunning: boolean;
  onSaveAndRun: (values: AutomaticRunValues) => Promise<void>;
}

const DEFAULT_VALUES: AutomaticRunValues = {
  topN: 10,
  minSuitabilityScore: 50,
  searchTerms: ["web developer"],
  runBudget: 200,
  country: "",
  cityLocations: [],
  workplaceTypes: ["remote", "hybrid", "onsite"],
  searchScope: "selected_only",
  matchStrictness: "exact_only",
};

interface AutomaticRunFormValues {
  topN: string;
  minSuitabilityScore: string;
  runBudget: string;
  country: string;
  cityLocations: string[];
  cityLocationDraft: string;
  workplaceTypes: WorkplaceType[];
  searchScope: LocationSearchScope;
  matchStrictness: LocationMatchStrictness;
  searchTerms: string[];
  searchTermDraft: string;
}

const GLASSDOOR_COUNTRY_REASON =
  "Glassdoor is not available for the selected country.";
const GLASSDOOR_LOCATION_REASON =
  "Add at least one city in Location preferences to enable Glassdoor.";
const HIDDEN_COUNTRY_KEYS = new Set(["usa/ca"]);
const MIN_RUN_BUDGET = 50;
const MAX_RUN_BUDGET = 1000;
const SOURCE_MOTION_EASE = [0.22, 1, 0.36, 1] as const;

function normalizeUiCountryKey(value: string): string {
  const normalized = normalizeCountryKey(value);
  if (normalized === "usa/ca") return "united states";
  return normalized;
}

function toNumber(input: string, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeRunBudget(value: number): number {
  return Math.min(MAX_RUN_BUDGET, Math.max(MIN_RUN_BUDGET, Math.round(value)));
}

function formatWorkplaceTypeLabel(workplaceType: WorkplaceType): string {
  if (workplaceType === "onsite") return "Onsite";
  return workplaceType.charAt(0).toUpperCase() + workplaceType.slice(1);
}

function getKnownJobSource(
  source: LocationSourcePlan["source"],
): JobSource | null {
  return source in EXTRACTOR_SOURCE_METADATA ? (source as JobSource) : null;
}

function getSourceStatus(args: {
  countrySelected: boolean;
  plan: LocationSourcePlan;
}): {
  badgeLabel: string;
  detail: string;
  available: boolean;
} {
  const { countrySelected, plan } = args;
  const { source, requestedCountry, requestedCities } = plan;
  const knownSource = getKnownJobSource(source);
  const countryLabel = requestedCountry
    ? formatCountryLabel(requestedCountry)
    : "";
  const sourceName = knownSource ? sourceLabel[knownSource] : source;
  const isUkOnlySource = knownSource
    ? Boolean(EXTRACTOR_SOURCE_METADATA[knownSource]?.ukOnly)
    : false;

  if (!countrySelected) {
    if (source === "glassdoor" || isUkOnlySource) {
      return {
        badgeLabel: "Select country",
        detail:
          "Pick a country first to check whether this source is available.",
        available: false,
      };
    }

    return {
      badgeLabel: "Available",
      detail: "This source is available without a country selection.",
      available: true,
    };
  }

  if (source === "glassdoor") {
    if (
      plan.capabilities.supportedCountryKeys !== null &&
      requestedCountry !== null &&
      !plan.capabilities.supportedCountryKeys.includes(requestedCountry)
    ) {
      return {
        badgeLabel: "Blocked",
        detail: GLASSDOOR_COUNTRY_REASON,
        available: false,
      };
    }

    if (
      plan.capabilities.requiresCityLocations &&
      requestedCities.length === 0
    ) {
      return {
        badgeLabel: "Needs city",
        detail: GLASSDOOR_LOCATION_REASON,
        available: false,
      };
    }

    return {
      badgeLabel: "Available",
      detail: "Glassdoor is available for this location intent.",
      available: true,
    };
  }

  if (isUkOnlySource && !plan.canRun) {
    return {
      badgeLabel: "UK only",
      detail: `${sourceName} is available only when country is United Kingdom.`,
      available: false,
    };
  }

  if (!plan.canRun) {
    return {
      badgeLabel: "Blocked",
      detail: `${sourceName} is not available for ${countryLabel || "the selected country"}.`,
      available: false,
    };
  }

  return {
    badgeLabel: "Available",
    detail: "Available for this location intent.",
    available: true,
  };
}

interface SourcePickerRow {
  source: JobSource;
  selected: boolean;
  status: ReturnType<typeof getSourceStatus>;
}

function getRadioOptionClassName(selected: boolean): string {
  return `flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm transition-colors ${
    selected
      ? "border-border/70 bg-muted/20 text-foreground"
      : "border-border/60 text-foreground hover:bg-muted/20"
  }`;
}

export const AutomaticRunTab: React.FC<AutomaticRunTabProps> = ({
  open,
  settings,
  enabledSources,
  pipelineSources,
  onToggleSource,
  onSetPipelineSources,
  isPipelineRunning,
  onSaveAndRun,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const [sourceDisplayOrder, setSourceDisplayOrder] =
    useState<JobSource[]>(enabledSources);
  const [browserCountrySuggestion, setBrowserCountrySuggestion] = useState<
    string | null
  >(null);
  const [selectedPreset, setSelectedPreset] =
    useState<AutomaticPresetSelection>("custom");
  const { watch, reset, setValue } = useForm<AutomaticRunFormValues>({
    defaultValues: {
      topN: String(DEFAULT_VALUES.topN),
      minSuitabilityScore: String(DEFAULT_VALUES.minSuitabilityScore),
      runBudget: String(DEFAULT_VALUES.runBudget),
      country: DEFAULT_VALUES.country,
      cityLocations: [],
      cityLocationDraft: "",
      workplaceTypes: DEFAULT_VALUES.workplaceTypes,
      searchScope: DEFAULT_VALUES.searchScope,
      matchStrictness: DEFAULT_VALUES.matchStrictness,
      searchTerms: DEFAULT_VALUES.searchTerms,
      searchTermDraft: "",
    },
  });

  const topNInput = watch("topN");
  const minScoreInput = watch("minSuitabilityScore");
  const runBudgetInput = watch("runBudget");
  const countryInput = watch("country");
  const cityLocations = watch("cityLocations");
  const cityLocationDraft = watch("cityLocationDraft");
  const workplaceTypes = watch("workplaceTypes");
  const searchScope = watch("searchScope");
  const matchStrictness = watch("matchStrictness");
  const searchTerms = watch("searchTerms");
  const searchTermDraft = watch("searchTermDraft");

  useEffect(() => {
    if (!open) return;
    const memory = loadAutomaticRunMemory();
    const fallbackRunBudget = normalizeRunBudget(
      settings?.jobspyResultsWanted?.value ??
        settings?.startupjobsMaxJobsPerTerm?.value ??
        settings?.adzunaMaxJobsPerTerm?.value ??
        settings?.gradcrackerMaxJobsPerTerm?.value ??
        settings?.ukvisajobsMaxJobs?.value ??
        DEFAULT_VALUES.runBudget,
    );
    const rememberedPresetValues =
      memory?.presetId && memory.presetId !== "custom"
        ? AUTOMATIC_PRESETS[memory.presetId]
        : null;
    const rememberedTopN =
      rememberedPresetValues?.topN ?? memory?.topN ?? DEFAULT_VALUES.topN;
    const rememberedMinSuitabilityScore =
      rememberedPresetValues?.minSuitabilityScore ??
      memory?.minSuitabilityScore ??
      DEFAULT_VALUES.minSuitabilityScore;
    const rememberedRunBudget = normalizeRunBudget(
      rememberedPresetValues?.runBudget ??
        memory?.runBudget ??
        fallbackRunBudget,
    );
    const hasExplicitLocationOverride = Boolean(
      settings?.jobspyCountryIndeed?.override ||
        settings?.searchCities?.override,
    );
    const rememberedCountry = normalizeUiCountryKey(
      settings?.jobspyCountryIndeed?.value ??
        settings?.searchCities?.value ??
        DEFAULT_VALUES.country,
    );
    const detectedCountry = !hasExplicitLocationOverride
      ? getDetectedCountryKey()
      : null;
    const countryValue = rememberedCountry || DEFAULT_VALUES.country;
    const suggestion =
      !countryValue && detectedCountry ? detectedCountry : null;
    const rememberedLocations = parseCityLocationsSetting(
      settings?.searchCities?.value,
    ).filter(
      (location) =>
        normalizeCountryKey(location) !== normalizeCountryKey(countryValue),
    );
    const rememberedWorkplaceTypes = normalizeWorkplaceTypes(
      settings?.workplaceTypes?.value,
    );
    const rememberedSearchScope =
      settings?.locationSearchScope?.value ?? DEFAULT_VALUES.searchScope;
    const rememberedMatchStrictness =
      settings?.locationMatchStrictness?.value ??
      DEFAULT_VALUES.matchStrictness;

    setBrowserCountrySuggestion(suggestion);
    reset({
      topN: String(rememberedTopN),
      minSuitabilityScore: String(rememberedMinSuitabilityScore),
      runBudget: String(rememberedRunBudget),
      country: countryValue,
      cityLocations: rememberedLocations,
      cityLocationDraft: "",
      workplaceTypes: rememberedWorkplaceTypes,
      searchScope: rememberedSearchScope,
      matchStrictness: rememberedMatchStrictness,
      searchTerms: settings?.searchTerms?.value ?? DEFAULT_VALUES.searchTerms,
      searchTermDraft: "",
    });
    setSelectedPreset(memory?.presetId ?? "custom");
    setAdvancedOpen(false);
  }, [open, settings, reset]);

  useEffect(() => {
    setSourceDisplayOrder((current) => {
      const filtered = current.filter((source) =>
        enabledSources.includes(source),
      );
      const additions = enabledSources.filter(
        (source) => !filtered.includes(source),
      );
      const next = [...filtered, ...additions];

      return next.length === current.length &&
        next.every((source, index) => source === current[index])
        ? current
        : next;
    });
  }, [enabledSources]);

  const values = useMemo<AutomaticRunValues>(() => {
    const normalizedCountry = normalizeUiCountryKey(countryInput);
    return {
      topN: toNumber(topNInput, 1, 50, DEFAULT_VALUES.topN),
      minSuitabilityScore: toNumber(
        minScoreInput,
        0,
        100,
        DEFAULT_VALUES.minSuitabilityScore,
      ),
      runBudget: toNumber(
        runBudgetInput,
        MIN_RUN_BUDGET,
        MAX_RUN_BUDGET,
        DEFAULT_VALUES.runBudget,
      ),
      country: normalizedCountry || DEFAULT_VALUES.country,
      cityLocations,
      workplaceTypes: normalizeWorkplaceTypes(workplaceTypes),
      searchScope,
      matchStrictness,
      searchTerms,
    };
  }, [
    topNInput,
    minScoreInput,
    runBudgetInput,
    countryInput,
    cityLocations,
    workplaceTypes,
    searchScope,
    matchStrictness,
    searchTerms,
  ]);

  const workplaceTypeSelectionInvalid = workplaceTypes.length === 0;

  const locationIntent = useMemo(
    () =>
      createLocationIntent({
        selectedCountry: values.country,
        cityLocations: values.cityLocations,
        workplaceTypes: values.workplaceTypes,
        searchScope: values.searchScope,
        matchStrictness: values.matchStrictness,
      }),
    [
      values.cityLocations,
      values.country,
      values.matchStrictness,
      values.searchScope,
      values.workplaceTypes,
    ],
  );

  const sourcePlans = useMemo(
    () =>
      planLocationSources({ intent: locationIntent, sources: enabledSources }),
    [enabledSources, locationIntent],
  );

  const sourcePlanBySource = useMemo(
    () =>
      new Map(
        sourcePlans.plans.map((plan) => [plan.source as JobSource, plan]),
      ),
    [sourcePlans.plans],
  );

  const isSourceAvailableForRun = useCallback(
    (source: JobSource) => sourcePlanBySource.get(source)?.canRun ?? false,
    [sourcePlanBySource],
  );

  const compatibleEnabledSources = useMemo(
    () =>
      sourcePlans.compatibleSources.filter((source): source is JobSource =>
        enabledSources.includes(source as JobSource),
      ),
    [enabledSources, sourcePlans.compatibleSources],
  );

  const compatiblePipelineSources = useMemo(
    () => pipelineSources.filter((source) => isSourceAvailableForRun(source)),
    [pipelineSources, isSourceAvailableForRun],
  );
  const countrySelectionInvalid = values.country.length === 0;
  const sourceRows = useMemo<SourcePickerRow[]>(
    () =>
      sourceDisplayOrder.flatMap((source) => {
        const plan = sourcePlanBySource.get(source);
        if (!plan) return [];

        return [
          {
            source,
            selected: pipelineSources.includes(source),
            status: getSourceStatus({
              countrySelected: !countrySelectionInvalid,
              plan,
            }),
          },
        ];
      }),
    [
      countrySelectionInvalid,
      pipelineSources,
      sourceDisplayOrder,
      sourcePlanBySource,
    ],
  );
  const selectedSourceRows = useMemo(
    () => sourceRows.filter((row) => row.selected && row.status.available),
    [sourceRows],
  );
  const readySourceRows = useMemo(
    () => sourceRows.filter((row) => !row.selected && row.status.available),
    [sourceRows],
  );
  const unavailableSourceRows = useMemo(
    () => sourceRows.filter((row) => !row.status.available),
    [sourceRows],
  );
  const sourceMotionTransition = useMemo(
    () =>
      prefersReducedMotion
        ? { duration: 0 }
        : { duration: 0.22, ease: SOURCE_MOTION_EASE },
    [prefersReducedMotion],
  );
  const sourceSectionInitial = prefersReducedMotion
    ? false
    : { opacity: 0, y: -8 };
  const sourceSectionAnimate = { opacity: 1, y: 0 };
  const sourceRowInitial = prefersReducedMotion
    ? { opacity: 1 }
    : { opacity: 0, y: 8, scale: 0.985 };
  const sourceRowExit = prefersReducedMotion
    ? { opacity: 0 }
    : { opacity: 0, y: -6, scale: 0.985 };
  const countrySuggestion =
    browserCountrySuggestion && browserCountrySuggestion !== values.country
      ? browserCountrySuggestion
      : null;

  useEffect(() => {
    const filtered = pipelineSources.filter((source) =>
      isSourceAvailableForRun(source),
    );
    if (filtered.length === pipelineSources.length) return;
    if (filtered.length > 0) {
      onSetPipelineSources(filtered);
      return;
    }
    if (compatibleEnabledSources.length > 0) {
      onSetPipelineSources([compatibleEnabledSources[0]]);
    }
  }, [
    compatibleEnabledSources,
    isSourceAvailableForRun,
    onSetPipelineSources,
    pipelineSources,
  ]);

  const estimate = useMemo(
    () =>
      calculateAutomaticEstimate({
        values,
        sources: compatiblePipelineSources,
      }),
    [values, compatiblePipelineSources],
  );

  const locationSummary = useMemo(
    () => summarizeLocationPreferences(values),
    [values],
  );

  const runDisabled =
    isPipelineRunning ||
    isSaving ||
    compatiblePipelineSources.length === 0 ||
    values.searchTerms.length === 0 ||
    countrySelectionInvalid ||
    workplaceTypeSelectionInvalid;

  const toggleWorkplaceType = (
    workplaceType: WorkplaceType,
    checked: boolean,
  ) => {
    const next = checked
      ? normalizeWorkplaceTypes([...workplaceTypes, workplaceType])
      : workplaceTypes.filter((value) => value !== workplaceType);

    setValue("workplaceTypes", next, { shouldDirty: true });
  };

  const handleSourceToggle = useCallback(
    (source: JobSource, checked: boolean) => {
      setSourceDisplayOrder((current) => [
        ...current.filter((value) => value !== source),
        source,
      ]);
      onToggleSource(source, checked);
    },
    [onToggleSource],
  );

  const applyPreset = (presetId: AutomaticPresetId) => {
    const preset = AUTOMATIC_PRESETS[presetId];
    setSelectedPreset(presetId);
    setValue("topN", String(preset.topN), { shouldDirty: true });
    setValue("minSuitabilityScore", String(preset.minSuitabilityScore), {
      shouldDirty: true,
    });
    setValue("runBudget", String(preset.runBudget), { shouldDirty: true });
  };

  const handleSaveAndRun = async () => {
    setIsSaving(true);
    try {
      saveAutomaticRunMemory({
        topN: values.topN,
        minSuitabilityScore: values.minSuitabilityScore,
        runBudget: values.runBudget,
        presetId: selectedPreset,
      });
      await onSaveAndRun(values);
    } finally {
      setIsSaving(false);
    }
  };

  const countryOptions = useMemo(
    () =>
      SUPPORTED_COUNTRY_KEYS.filter(
        (country) => !HIDDEN_COUNTRY_KEYS.has(country),
      ).map((country) => ({
        value: country,
        label: formatCountryLabel(country),
      })),
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
        <Card>
          <CardContent className="space-y-6 pt-6">
            <div className="grid items-center gap-3 md:grid-cols-[120px_1fr]">
              <Label className="text-base font-semibold">Preset</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={selectedPreset === "fast" ? "default" : "outline"}
                  aria-pressed={selectedPreset === "fast"}
                  onClick={() => applyPreset("fast")}
                >
                  Fast
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    selectedPreset === "balanced" ? "default" : "outline"
                  }
                  aria-pressed={selectedPreset === "balanced"}
                  onClick={() => applyPreset("balanced")}
                >
                  Balanced
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    selectedPreset === "detailed" ? "default" : "outline"
                  }
                  aria-pressed={selectedPreset === "detailed"}
                  onClick={() => applyPreset("detailed")}
                >
                  Detailed
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    selectedPreset === "custom" ? "secondary" : "outline"
                  }
                  aria-pressed={selectedPreset === "custom"}
                  onClick={() => setSelectedPreset("custom")}
                >
                  Custom
                </Button>
              </div>
            </div>
            <Separator />
            <Accordion
              type="single"
              collapsible
              defaultValue="location-intent"
              className="w-full"
            >
              <AccordionItem value="location-intent" className="border-b-0">
                <AccordionTrigger
                  aria-label="Review and edit location intent"
                  className="gap-4 py-2 hover:no-underline"
                >
                  <div className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="py-0 text-base font-semibold hover:no-underline">
                        Location preferences
                      </p>
                      <p className="truncate text-sm text-muted-foreground whitespace-pre-wrap">
                        {locationSummary}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {countrySuggestion ? (
                        <Badge
                          variant="outline"
                          className="rounded-full border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200"
                        >
                          Browser suggestion
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-4">
                  {countrySuggestion ? (
                    <Alert className="border-sky-500/20 bg-sky-500/5">
                      <Info className="h-4 w-4" />
                      <AlertTitle>Detected from your browser</AlertTitle>
                      <AlertDescription>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-sm leading-6 text-muted-foreground">
                            We detected{" "}
                            <span className="font-medium text-foreground">
                              {formatCountryLabel(countrySuggestion)}
                            </span>{" "}
                            as a helpful starting point. Apply it to unlock
                            country-specific sources, or choose another country.
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() =>
                              setValue("country", countrySuggestion, {
                                shouldDirty: true,
                              })
                            }
                          >
                            Use suggestion
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  <div className="grid gap-4 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">Country</Label>
                      <SearchableDropdown
                        value={values.country}
                        options={countryOptions}
                        onValueChange={(country) =>
                          setValue("country", country, {
                            shouldDirty: true,
                          })
                        }
                        placeholder="Select country"
                        searchPlaceholder="Search country..."
                        emptyText="No matching countries."
                        triggerClassName="h-10 w-full"
                        ariaLabel={
                          values.country
                            ? formatCountryLabel(values.country)
                            : "Select country"
                        }
                      />
                      {countrySelectionInvalid ? (
                        <p className="text-xs text-destructive">
                          {countrySuggestion
                            ? "Select a country or use the browser suggestion."
                            : "Select a country."}
                        </p>
                      ) : null}
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="city-locations-input"
                        className="text-base font-semibold"
                      >
                        Cities
                      </Label>
                      <TokenizedInput
                        id="city-locations-input"
                        values={cityLocations}
                        draft={cityLocationDraft}
                        parseInput={parseCityLocationsInput}
                        onDraftChange={(value) =>
                          setValue("cityLocationDraft", value)
                        }
                        onValuesChange={(value) =>
                          setValue("cityLocations", value, {
                            shouldDirty: true,
                          })
                        }
                        placeholder='e.g. "London"'
                        removeLabelPrefix="Remove city"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Work arrangement
                    </p>
                    <div className="flex flex-wrap gap-2 gap-x-4">
                      {WORKPLACE_TYPE_OPTIONS.map((workplaceType) => {
                        const checkboxId = `workplace-type-${workplaceType}`;
                        const checked = workplaceTypes.includes(workplaceType);

                        return (
                          <label
                            key={workplaceType}
                            htmlFor={checkboxId}
                            className="flex cursor-pointer items-center gap-3 text-sm transition-colors"
                          >
                            <Checkbox
                              id={checkboxId}
                              checked={checked}
                              onCheckedChange={(nextChecked) => {
                                toggleWorkplaceType(
                                  workplaceType,
                                  nextChecked === true,
                                );
                              }}
                            />
                            {formatWorkplaceTypeLabel(workplaceType)}
                          </label>
                        );
                      })}
                    </div>
                    {workplaceTypeSelectionInvalid ? (
                      <p className="text-xs text-destructive">
                        Select at least one workplace type.
                      </p>
                    ) : null}
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Location scope
                    </p>
                    <RadioGroup
                      value={searchScope}
                      onValueChange={(value) =>
                        setValue("searchScope", value as LocationSearchScope, {
                          shouldDirty: true,
                        })
                      }
                      className="gap-2"
                    >
                      {SEARCH_SCOPE_OPTIONS.map((option) => {
                        const id = `search-scope-${option.value}`;
                        const selected = searchScope === option.value;
                        return (
                          <label
                            key={option.value}
                            htmlFor={id}
                            className={getRadioOptionClassName(selected)}
                          >
                            <RadioGroupItem value={option.value} id={id} />
                            <span className="text-sm font-medium">
                              {option.label}
                            </span>
                          </label>
                        );
                      })}
                    </RadioGroup>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Match strictness
                    </p>
                    <RadioGroup
                      value={matchStrictness}
                      onValueChange={(value) =>
                        setValue(
                          "matchStrictness",
                          value as LocationMatchStrictness,
                          {
                            shouldDirty: true,
                          },
                        )
                      }
                      className="gap-2"
                    >
                      {MATCH_STRICTNESS_OPTIONS.map((option) => {
                        const id = `match-strictness-${option.value}`;
                        const selected = matchStrictness === option.value;
                        return (
                          <label
                            key={option.value}
                            htmlFor={id}
                            className={getRadioOptionClassName(selected)}
                          >
                            <RadioGroupItem value={option.value} id={id} />
                            <span className="text-sm font-medium">
                              {option.label}
                            </span>
                          </label>
                        );
                      })}
                    </RadioGroup>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <Accordion
              type="single"
              collapsible
              value={advancedOpen ? "advanced" : ""}
              onValueChange={(value) => setAdvancedOpen(value === "advanced")}
            >
              <AccordionItem value="advanced" className="border-b-0">
                <AccordionTrigger className="py-0 text-base font-semibold hover:no-underline">
                  Run settings
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="top-n">Resumes tailored</Label>
                      <Input
                        id="top-n"
                        type="number"
                        min={1}
                        max={50}
                        value={topNInput}
                        onChange={(event) => {
                          setSelectedPreset("custom");
                          setValue("topN", event.target.value);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="min-score">Min suitability score</Label>
                      <Input
                        id="min-score"
                        type="number"
                        min={0}
                        max={100}
                        value={minScoreInput}
                        onChange={(event) => {
                          setSelectedPreset("custom");
                          setValue("minSuitabilityScore", event.target.value);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jobs-per-term">Max jobs discovered</Label>
                      <Input
                        id="jobs-per-term"
                        type="number"
                        min={MIN_RUN_BUDGET}
                        max={MAX_RUN_BUDGET}
                        value={runBudgetInput}
                        onChange={(event) => {
                          setSelectedPreset("custom");
                          setValue("runBudget", event.target.value);
                        }}
                      />
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Search terms</CardTitle>
          </CardHeader>
          <CardContent>
            <TokenizedInput
              id="search-terms-input"
              values={searchTerms}
              draft={searchTermDraft}
              parseInput={parseSearchTermsInput}
              onDraftChange={(value) => setValue("searchTermDraft", value)}
              onValuesChange={(value) =>
                setValue("searchTerms", value, { shouldDirty: true })
              }
              placeholder="Type and press Enter"
              helperText="Add multiple terms by separating with commas or pressing Enter."
              removeLabelPrefix="Remove"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="sources" className="border-b-0">
                <AccordionTrigger
                  aria-label="Review and edit sources"
                  className="gap-4 py-2 hover:no-underline"
                >
                  <motion.div
                    layout
                    transition={sourceMotionTransition}
                    className="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
                  >
                    <motion.div
                      layout
                      transition={sourceMotionTransition}
                      className="min-w-0 space-y-1"
                    >
                      <p className="text-sm font-semibold text-foreground">
                        {selectedSourceRows.length === 0
                          ? "Choose sources for this run"
                          : `${selectedSourceRows.length} source${selectedSourceRows.length === 1 ? "" : "s"} selected`}
                      </p>
                    </motion.div>
                    <motion.div
                      layout
                      transition={sourceMotionTransition}
                      className="flex shrink-0 flex-wrap gap-2"
                    >
                      <Badge variant="outline" className="rounded-full">
                        {selectedSourceRows.length} selected
                      </Badge>
                      <Badge variant="outline" className="rounded-full">
                        {
                          sourceRows.filter((row) => row.status.available)
                            .length
                        }{" "}
                        available
                      </Badge>
                      {unavailableSourceRows.length > 0 ? (
                        <Badge variant="outline" className="rounded-full">
                          {unavailableSourceRows.length} unavailable
                        </Badge>
                      ) : null}
                    </motion.div>
                  </motion.div>
                </AccordionTrigger>
                <AccordionContent className="pt-4">
                  <motion.div
                    initial={sourceSectionInitial}
                    animate={sourceSectionAnimate}
                    transition={sourceMotionTransition}
                    className="space-y-5"
                  >
                    {selectedSourceRows.length > 0 ? (
                      <motion.div
                        layout
                        transition={sourceMotionTransition}
                        className="space-y-2"
                      >
                        <motion.p
                          layout
                          transition={sourceMotionTransition}
                          className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                        >
                          Selected
                        </motion.p>
                        <motion.div
                          layout
                          transition={sourceMotionTransition}
                          className="grid gap-2 md:grid-cols-2"
                        >
                          <AnimatePresence initial={false} mode="popLayout">
                            {selectedSourceRows.map((row) => (
                              <motion.div
                                key={row.source}
                                layout
                                initial={sourceRowInitial}
                                animate={sourceSectionAnimate}
                                exit={sourceRowExit}
                                transition={sourceMotionTransition}
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  aria-label={sourceLabel[row.source]}
                                  aria-pressed
                                  title="Included in this run."
                                  className="flex h-auto w-full items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/10 px-3 py-3 text-left text-foreground transition-colors duration-200 hover:bg-primary/15"
                                  onClick={() =>
                                    handleSourceToggle(row.source, false)
                                  }
                                >
                                  <span className="min-w-0">
                                    <span className="block text-sm font-semibold">
                                      {sourceLabel[row.source]}
                                    </span>
                                  </span>
                                </Button>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </motion.div>
                      </motion.div>
                    ) : null}

                    {readySourceRows.length > 0 ? (
                      <motion.div
                        layout
                        transition={sourceMotionTransition}
                        className="space-y-2"
                      >
                        <motion.p
                          layout
                          transition={sourceMotionTransition}
                          className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                        >
                          Available
                        </motion.p>
                        <motion.div
                          layout
                          transition={sourceMotionTransition}
                          className="grid gap-2 md:grid-cols-2"
                        >
                          <AnimatePresence initial={false} mode="popLayout">
                            {readySourceRows.map((row) => (
                              <motion.div
                                key={row.source}
                                layout
                                initial={sourceRowInitial}
                                animate={sourceSectionAnimate}
                                exit={sourceRowExit}
                                transition={sourceMotionTransition}
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  aria-label={sourceLabel[row.source]}
                                  aria-pressed={false}
                                  title="Available for this location setup."
                                  className="flex h-auto w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-3 text-left text-foreground transition-colors duration-200 hover:bg-muted/40"
                                  onClick={() =>
                                    handleSourceToggle(row.source, true)
                                  }
                                >
                                  <span className="min-w-0">
                                    <span className="block text-sm font-semibold">
                                      {sourceLabel[row.source]}
                                    </span>
                                  </span>
                                </Button>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </motion.div>
                      </motion.div>
                    ) : null}

                    {unavailableSourceRows.length > 0 ? (
                      <motion.div
                        layout
                        transition={sourceMotionTransition}
                        className="space-y-2"
                      >
                        <motion.p
                          layout
                          transition={sourceMotionTransition}
                          className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground"
                        >
                          Currently unavailable
                        </motion.p>
                        <motion.div
                          layout
                          transition={sourceMotionTransition}
                          className="grid gap-2 md:grid-cols-2"
                        >
                          <AnimatePresence initial={false} mode="popLayout">
                            {unavailableSourceRows.map((row) => (
                              <motion.div
                                key={row.source}
                                layout
                                initial={sourceRowInitial}
                                animate={sourceSectionAnimate}
                                exit={sourceRowExit}
                                transition={sourceMotionTransition}
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  disabled
                                  aria-label={sourceLabel[row.source]}
                                  title={row.status.detail}
                                  className="flex h-auto w-full items-start justify-between gap-3 rounded-xl border border-border/50 bg-transparent px-3 py-3 text-left text-foreground/80 disabled:pointer-events-none disabled:opacity-100"
                                >
                                  <span className="min-w-0 space-y-1">
                                    <span className="block text-sm font-semibold">
                                      {sourceLabel[row.source]}
                                    </span>
                                    <span className="block text-xs leading-5 text-muted-foreground whitespace-pre-wrap">
                                      {row.status.detail}
                                    </span>
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                                  >
                                    {row.status.badgeLabel}
                                  </Badge>
                                </Button>
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </motion.div>
                      </motion.div>
                    ) : null}
                  </motion.div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 flex shrink-0 items-center justify-between border-t border-border/60 bg-background pt-3">
        <div className="hidden text-sm text-muted-foreground md:block">
          Est: {estimate.discovered.min}-{estimate.discovered.max} jobs, ~
          {values.topN} resumes
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            className="gap-2"
            disabled={runDisabled}
            onClick={() => void handleSaveAndRun()}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Start run now
          </Button>
        </div>
      </div>
    </div>
  );
};
