import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  formatCountryLabel,
  getCompatibleSourcesForCountry,
  isSourceAllowedForCountry,
  normalizeCountryKey,
  SUPPORTED_COUNTRY_KEYS,
} from "@shared/location-support.js";
import type { AppSettings, JobSource } from "@shared/types";
import { Check, ChevronsUpDown, Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, sourceLabel } from "@/lib/utils";
import {
  AUTOMATIC_PRESETS,
  type AutomaticPresetId,
  type AutomaticRunValues,
  calculateAutomaticEstimate,
  loadAutomaticRunMemory,
  parseSearchTermsInput,
  saveAutomaticRunMemory,
} from "./automatic-run";

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
};

interface AutomaticRunFormValues {
  topN: string;
  minSuitabilityScore: string;
  runBudget: string;
  country: string;
  searchTerms: string[];
  searchTermDraft: string;
}

type AutomaticPresetSelection = AutomaticPresetId | "custom";

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
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);
  const { watch, reset, setValue, getValues } = useForm<AutomaticRunFormValues>(
    {
      defaultValues: {
        topN: String(DEFAULT_VALUES.topN),
        minSuitabilityScore: String(DEFAULT_VALUES.minSuitabilityScore),
        runBudget: String(DEFAULT_VALUES.runBudget),
        country: DEFAULT_VALUES.country,
        searchTerms: DEFAULT_VALUES.searchTerms,
        searchTermDraft: "",
      },
    },
  );

  const topNInput = watch("topN");
  const minScoreInput = watch("minSuitabilityScore");
  const runBudgetInput = watch("runBudget");
  const countryInput = watch("country");
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
      settings?.gradcrackerMaxJobsPerTerm ??
      settings?.ukvisajobsMaxJobs ??
      DEFAULT_VALUES.runBudget;
    const rememberedCountry = normalizeCountryKey(
      settings?.jobspyCountryIndeed ??
        settings?.jobspyLocation ??
        DEFAULT_VALUES.country,
    );

    reset({
      topN: String(topN),
      minSuitabilityScore: String(minSuitabilityScore),
      runBudget: String(rememberedRunBudget),
      country: rememberedCountry || DEFAULT_VALUES.country,
      searchTerms: settings?.searchTerms ?? DEFAULT_VALUES.searchTerms,
      searchTermDraft: "",
    });
    setAdvancedOpen(false);
    setCountryMenuOpen(false);
  }, [open, settings, reset]);

  const addSearchTerms = (input: string) => {
    const parsed = parseSearchTermsInput(input);
    if (parsed.length === 0) return;
    const current = getValues("searchTerms");
    const next = [...current];
    for (const term of parsed) {
      if (!next.includes(term)) next.push(term);
    }
    setValue("searchTerms", next, { shouldDirty: true });
  };

  const values = useMemo<AutomaticRunValues>(() => {
    const normalizedCountry = normalizeCountryKey(countryInput);
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
      searchTerms,
    };
  }, [topNInput, minScoreInput, runBudgetInput, countryInput, searchTerms]);

  const compatibleEnabledSources = useMemo(
    () =>
      enabledSources.filter((source) =>
        isSourceAllowedForCountry(source, values.country),
      ),
    [enabledSources, values.country],
  );

  const compatiblePipelineSources = useMemo(
    () => getCompatibleSourcesForCountry(pipelineSources, values.country),
    [pipelineSources, values.country],
  );

  useEffect(() => {
    const filtered = getCompatibleSourcesForCountry(
      pipelineSources,
      values.country,
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
    onSetPipelineSources,
    pipelineSources,
    values.country,
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

  const countryOptions = SUPPORTED_COUNTRY_KEYS;

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
              <Popover open={countryMenuOpen} onOpenChange={setCountryMenuOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={countryMenuOpen}
                    aria-label={formatCountryLabel(values.country)}
                    className="h-9 w-full justify-between md:max-w-xs"
                  >
                    {formatCountryLabel(values.country)}
                    <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverPrimitive.Content
                  align="start"
                  sideOffset={4}
                  className={cn(
                    "z-50 w-[320px] rounded-md border bg-popover p-0 text-popover-foreground shadow-md outline-none",
                    "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
                    "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
                    "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2",
                    "data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
                    "origin-[--radix-popover-content-transform-origin]",
                  )}
                >
                  <Command loop>
                    <CommandInput placeholder="Search country..." />
                    <CommandList
                      className="max-h-56"
                      onWheelCapture={(event) => event.stopPropagation()}
                    >
                      <CommandEmpty>No matching countries.</CommandEmpty>
                      <CommandGroup>
                        {countryOptions.map((country) => {
                          const selected = values.country === country;
                          const label = formatCountryLabel(country);
                          return (
                            <CommandItem
                              key={country}
                              value={`${country} ${label}`}
                              onSelect={() => {
                                setValue("country", country, {
                                  shouldDirty: true,
                                });
                                setCountryMenuOpen(false);
                              }}
                            >
                              {label}
                              <Check
                                className={cn(
                                  "ml-auto h-4 w-4",
                                  selected ? "opacity-100" : "opacity-0",
                                )}
                              />
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverPrimitive.Content>
              </Popover>
            </div>
            <Separator />
            <Accordion
              type="single"
              collapsible
              value={advancedOpen ? "advanced" : undefined}
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
          <CardContent className="space-y-3">
            <Input
              id="search-terms-input"
              value={searchTermDraft}
              onChange={(event) =>
                setValue("searchTermDraft", event.target.value)
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  addSearchTerms(searchTermDraft);
                  setValue("searchTermDraft", "");
                  return;
                }
                if (
                  event.key === "Backspace" &&
                  searchTermDraft.length === 0 &&
                  searchTerms.length > 0
                ) {
                  setValue("searchTerms", searchTerms.slice(0, -1), {
                    shouldDirty: true,
                  });
                }
              }}
              onBlur={() => {
                addSearchTerms(searchTermDraft);
                setValue("searchTermDraft", "");
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text");
                const parsed = parseSearchTermsInput(pasted);
                if (parsed.length > 1) {
                  event.preventDefault();
                  addSearchTerms(pasted);
                }
              }}
              placeholder="Type and press Enter"
            />
            <p className="text-xs text-muted-foreground">
              Add multiple terms by separating with commas or pressing Enter.
            </p>
            <div className="flex flex-wrap gap-2">
              {searchTerms.map((term) => (
                <button
                  type="button"
                  key={term}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/20 px-3 py-1 text-sm transition-all duration-150 hover:border-primary/50 hover:bg-primary/40 hover:text-primary-foreground hover:shadow-sm"
                  aria-label={`Remove ${term}`}
                  onClick={() =>
                    setValue(
                      "searchTerms",
                      searchTerms.filter((value) => value !== term),
                      { shouldDirty: true },
                    )
                  }
                >
                  {term}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
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
                const allowed = isSourceAllowedForCountry(
                  source,
                  values.country,
                );
                const selected = compatiblePipelineSources.includes(source);
                const disabledReason = `${sourceLabel[source]} is available only when country is United Kingdom.`;

                const button = (
                  <Button
                    key={source}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    disabled={!allowed}
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
                      <span className="inline-flex" title={disabledReason}>
                        {button}
                      </span>
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
