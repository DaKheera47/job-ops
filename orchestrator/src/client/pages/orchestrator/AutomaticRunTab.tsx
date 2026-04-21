import { EXTRACTOR_SOURCE_METADATA } from "@shared/extractors";
import type {
  LocationMatchStrictness,
  LocationSearchScope,
} from "@shared/location-preferences.js";
import {
  formatCountryLabel,
  isSourceAllowedForCountry,
  normalizeCountryKey,
  SUPPORTED_COUNTRY_KEYS,
} from "@shared/location-support.js";
import type { AppSettings, JobSource } from "@shared/types";
import { Loader2, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

function normalizeUiCountryKey(value: string): string {
  const normalized = normalizeCountryKey(value);
  if (normalized === "usa/ca") return "united states";
  return normalized;
}

function getSourceDisabledReason(
  source: JobSource,
  countryAllowed: boolean,
): string {
  if (source === "glassdoor") {
    return countryAllowed
      ? GLASSDOOR_LOCATION_REASON
      : GLASSDOOR_COUNTRY_REASON;
  }
  if (EXTRACTOR_SOURCE_METADATA[source]?.ukOnly) {
    return `${sourceLabel[source]} is available only when country is United Kingdom.`;
  }
  return `${sourceLabel[source]} is not available for the selected country.`;
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
    const defaultLocationCountry = !hasExplicitLocationOverride
      ? getDetectedCountryKey()
      : null;
    const rememberedCountry = normalizeUiCountryKey(
      hasExplicitLocationOverride
        ? (settings?.jobspyCountryIndeed?.value ??
            settings?.searchCities?.value ??
            DEFAULT_VALUES.country)
        : (defaultLocationCountry ??
            settings?.jobspyCountryIndeed?.value ??
            settings?.searchCities?.value ??
            DEFAULT_VALUES.country),
    );
    const rememberedCountryKey = rememberedCountry || DEFAULT_VALUES.country;
    const rememberedLocations = parseCityLocationsSetting(
      settings?.searchCities?.value,
    ).filter(
      (location) =>
        normalizeCountryKey(location) !==
        normalizeCountryKey(rememberedCountryKey),
    );
    const rememberedWorkplaceTypes = normalizeWorkplaceTypes(
      settings?.workplaceTypes?.value,
    );
    const rememberedSearchScope =
      settings?.locationSearchScope?.value ?? DEFAULT_VALUES.searchScope;
    const rememberedMatchStrictness =
      settings?.locationMatchStrictness?.value ??
      DEFAULT_VALUES.matchStrictness;

    reset({
      topN: String(rememberedTopN),
      minSuitabilityScore: String(rememberedMinSuitabilityScore),
      runBudget: String(rememberedRunBudget),
      country: rememberedCountry || DEFAULT_VALUES.country,
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

  const isSourceAvailableForRun = useCallback(
    (source: JobSource) => {
      if (!isSourceAllowedForCountry(source, values.country)) return false;
      if (source === "glassdoor" && values.cityLocations.length === 0)
        return false;
      return true;
    },
    [values.country, values.cityLocations.length],
  );

  const compatibleEnabledSources = useMemo(
    () => enabledSources.filter((source) => isSourceAvailableForRun(source)),
    [enabledSources, isSourceAvailableForRun],
  );

  const compatiblePipelineSources = useMemo(
    () => pipelineSources.filter((source) => isSourceAvailableForRun(source)),
    [pipelineSources, isSourceAvailableForRun],
  );

  const countrySelectionInvalid = values.country.length === 0;

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
            <section className="space-y-6">
              <div className="space-y-3">
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
                        Select a country.
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
                        className={`flex cursor-pointer items-center gap-3 text-sm transition-colors`}
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
                        className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition-colors ${
                          selected
                            ? "bg-muted text-foreground"
                            : "text-foreground/80 hover:bg-muted/60"
                        }`}
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
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  {MATCH_STRICTNESS_OPTIONS.map((option) => {
                    const id = `match-strictness-${option.value}`;
                    const selected = matchStrictness === option.value;
                    return (
                      <label
                        key={option.value}
                        htmlFor={id}
                        className={`flex cursor-pointer items-center gap-3 rounded-full border px-4 py-2.5 text-sm transition-colors ${
                          selected
                            ? "border-foreground/25 bg-muted text-foreground"
                            : "border-border/70 text-foreground/75 hover:border-border hover:text-foreground"
                        }`}
                      >
                        <RadioGroupItem value={option.value} id={id} />
                        <span className="font-medium">{option.label}</span>
                      </label>
                    );
                  })}
                </RadioGroup>
              </div>

              <div className="rounded-2xl bg-muted px-4 py-4">
                <p className="text-base font-medium leading-6 text-foreground">
                  {locationSummary}
                </p>
              </div>
            </section>

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
          <CardHeader className="pb-3">
            <CardTitle>
              Sources ({compatiblePipelineSources.length}/
              {compatibleEnabledSources.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <TooltipProvider>
              {enabledSources.map((source) => {
                const countryAllowed = isSourceAllowedForCountry(
                  source,
                  values.country,
                );
                const allowed = isSourceAvailableForRun(source);
                const selected = compatiblePipelineSources.includes(source);
                const disabledReason = getSourceDisabledReason(
                  source,
                  countryAllowed,
                );

                const button = (
                  <Button
                    key={source}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    disabled={!allowed}
                    title={!allowed ? disabledReason : undefined}
                    onClick={() => onToggleSource(source, !selected)}
                  >
                    {sourceLabel[source]}
                  </Button>
                );

                if (allowed) {
                  return button;
                }

                return (
                  <Tooltip key={source}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex">{button}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top">{disabledReason}</TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
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
