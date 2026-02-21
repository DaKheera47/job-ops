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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { sourceLabel } from "@/lib/utils";
import {
  AUTOMATIC_PRESETS,
  type AutomaticPresetId,
  type AutomaticRunValues,
  calculateAutomaticEstimate,
  loadAutomaticRunMemory,
  parseCityLocationsInput,
  parseCityLocationsSetting,
  parseSearchTermsInput,
  saveAutomaticRunMemory,
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
  country: "united kingdom",
  cityLocations: [],
};

interface AutomaticRunFormValues {
  topN: string;
  minSuitabilityScore: string;
  runBudget: string;
  country: string;
  cityLocations: string[];
  cityLocationDraft: string;
  searchTerms: string[];
  searchTermDraft: string;
}

type AutomaticPresetSelection = AutomaticPresetId | "custom";

const GLASSDOOR_COUNTRY_REASON =
  "Glassdoor is not available for the selected country.";
const GLASSDOOR_LOCATION_REASON =
  "Add at least one city in Advanced settings to enable Glassdoor.";
const UK_ONLY_SOURCES = new Set<JobSource>(["gradcracker", "ukvisajobs"]);
const HIDDEN_COUNTRY_KEYS = new Set(["usa/ca"]);

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
  if (UK_ONLY_SOURCES.has(source)) {
    return `${sourceLabel[source]} is available only when country is United Kingdom.`;
  }
  return `${sourceLabel[source]} is not available for the selected country.`;
}

function toNumber(input: string, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function getPresetSelection(values: {
  topN: number;
  minSuitabilityScore: number;
  runBudget: number;
}): AutomaticPresetSelection {
  if (
    values.topN === AUTOMATIC_PRESETS.fast.topN &&
    values.minSuitabilityScore === AUTOMATIC_PRESETS.fast.minSuitabilityScore &&
    values.runBudget === AUTOMATIC_PRESETS.fast.runBudget
  ) {
    return "fast";
  }
  if (
    values.topN === AUTOMATIC_PRESETS.balanced.topN &&
    values.minSuitabilityScore ===
      AUTOMATIC_PRESETS.balanced.minSuitabilityScore &&
    values.runBudget === AUTOMATIC_PRESETS.balanced.runBudget
  ) {
    return "balanced";
  }
  if (
    values.topN === AUTOMATIC_PRESETS.detailed.topN &&
    values.minSuitabilityScore ===
      AUTOMATIC_PRESETS.detailed.minSuitabilityScore &&
    values.runBudget === AUTOMATIC_PRESETS.detailed.runBudget
  ) {
    return "detailed";
  }
  return "custom";
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
  const { watch, reset, setValue } = useForm<AutomaticRunFormValues>({
    defaultValues: {
      topN: String(DEFAULT_VALUES.topN),
      minSuitabilityScore: String(DEFAULT_VALUES.minSuitabilityScore),
      runBudget: String(DEFAULT_VALUES.runBudget),
      country: DEFAULT_VALUES.country,
      cityLocations: [],
      cityLocationDraft: "",
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
  const searchTerms = watch("searchTerms");
  const searchTermDraft = watch("searchTermDraft");

  useEffect(() => {
    if (!open) return;
    const memory = loadAutomaticRunMemory();
    const topN = memory?.topN ?? DEFAULT_VALUES.topN;
    const minSuitabilityScore =
      memory?.minSuitabilityScore ?? DEFAULT_VALUES.minSuitabilityScore;

    const rememberedRunBudget =
      settings?.jobspyResultsWanted ??
      settings?.adzunaMaxJobsPerTerm ??
      settings?.gradcrackerMaxJobsPerTerm ??
      settings?.ukvisajobsMaxJobs ??
      DEFAULT_VALUES.runBudget;
    const rememberedCountry = normalizeUiCountryKey(
      settings?.jobspyCountryIndeed ??
        settings?.searchCities ??
        DEFAULT_VALUES.country,
    );
    const rememberedCountryKey = rememberedCountry || DEFAULT_VALUES.country;
    const rememberedLocations = parseCityLocationsSetting(
      settings?.searchCities,
    ).filter(
      (location) =>
        normalizeCountryKey(location) !==
        normalizeCountryKey(rememberedCountryKey),
    );

    reset({
      topN: String(topN),
      minSuitabilityScore: String(minSuitabilityScore),
      runBudget: String(rememberedRunBudget),
      country: rememberedCountry || DEFAULT_VALUES.country,
      cityLocations: rememberedLocations,
      cityLocationDraft: "",
      searchTerms: settings?.searchTerms ?? DEFAULT_VALUES.searchTerms,
      searchTermDraft: "",
    });
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
      runBudget: toNumber(runBudgetInput, 1, 1000, DEFAULT_VALUES.runBudget),
      country: normalizedCountry || DEFAULT_VALUES.country,
      cityLocations,
      searchTerms,
    };
  }, [
    topNInput,
    minScoreInput,
    runBudgetInput,
    countryInput,
    cityLocations,
    searchTerms,
  ]);

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

  const activePreset = useMemo<AutomaticPresetSelection>(
    () => getPresetSelection(values),
    [values],
  );

  const runDisabled =
    isPipelineRunning ||
    isSaving ||
    compatiblePipelineSources.length === 0 ||
    values.searchTerms.length === 0;

  const applyPreset = (presetId: AutomaticPresetId) => {
    const preset = AUTOMATIC_PRESETS[presetId];
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
          <CardContent className="space-y-4 pt-6">
            <div className="grid items-center gap-3 md:grid-cols-[120px_1fr]">
              <Label className="text-base font-semibold">Preset</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={activePreset === "fast" ? "default" : "outline"}
                  onClick={() => applyPreset("fast")}
                >
                  Fast
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activePreset === "balanced" ? "default" : "outline"}
                  onClick={() => applyPreset("balanced")}
                >
                  Balanced
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activePreset === "detailed" ? "default" : "outline"}
                  onClick={() => applyPreset("detailed")}
                >
                  Detailed
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={activePreset === "custom" ? "secondary" : "outline"}
                >
                  Custom
                </Button>
              </div>
            </div>

            <div className="grid items-center gap-3 md:grid-cols-[120px_1fr]">
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
                triggerClassName="h-9 w-full md:max-w-xs"
                ariaLabel={formatCountryLabel(values.country)}
              />
            </div>
            <Separator />
            <Accordion
              type="single"
              collapsible
              value={advancedOpen ? "advanced" : ""}
              onValueChange={(value) => setAdvancedOpen(value === "advanced")}
            >
              <AccordionItem value="advanced" className="border-b-0">
                <AccordionTrigger className="py-0 text-base font-semibold hover:no-underline">
                  Advanced settings
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
                        onChange={(event) =>
                          setValue("topN", event.target.value)
                        }
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
                        onChange={(event) =>
                          setValue("minSuitabilityScore", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jobs-per-term">Max jobs discovered</Label>
                      <Input
                        id="jobs-per-term"
                        type="number"
                        min={1}
                        max={1000}
                        value={runBudgetInput}
                        onChange={(event) =>
                          setValue("runBudget", event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2 md:col-span-3">
                      <Label htmlFor="city-locations-input">Cities</Label>
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
                        helperText="Optional for all sources, required when Glassdoor is selected."
                        removeLabelPrefix="Remove city"
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
