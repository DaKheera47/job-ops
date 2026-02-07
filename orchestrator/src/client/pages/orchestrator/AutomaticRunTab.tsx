import type { AppSettings, JobSource } from "@shared/types";
import { Loader2, Sparkles, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { sourceLabel } from "@/lib/utils";
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
  isPipelineRunning: boolean;
  onSaveAndRun: (values: AutomaticRunValues) => Promise<void>;
}

const DEFAULT_VALUES: AutomaticRunValues = {
  topN: 10,
  minSuitabilityScore: 50,
  searchTerms: ["web developer"],
  runBudget: 200,
};

interface AutomaticRunFormValues {
  topN: string;
  minSuitabilityScore: string;
  runBudget: string;
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
  isPipelineRunning,
  onSaveAndRun,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { watch, reset, setValue, getValues } = useForm<AutomaticRunFormValues>(
    {
      defaultValues: {
        topN: String(DEFAULT_VALUES.topN),
        minSuitabilityScore: String(DEFAULT_VALUES.minSuitabilityScore),
        runBudget: String(DEFAULT_VALUES.runBudget),
        searchTerms: DEFAULT_VALUES.searchTerms,
        searchTermDraft: "",
      },
    },
  );

  const topNInput = watch("topN");
  const minScoreInput = watch("minSuitabilityScore");
  const runBudgetInput = watch("runBudget");
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
    reset({
      topN: String(topN),
      minSuitabilityScore: String(minSuitabilityScore),
      runBudget: String(rememberedRunBudget),
      searchTerms: settings?.searchTerms ?? DEFAULT_VALUES.searchTerms,
      searchTermDraft: "",
    });
    setAdvancedOpen(false);
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
    return {
      topN: toNumber(topNInput, 1, 50, DEFAULT_VALUES.topN),
      minSuitabilityScore: toNumber(
        minScoreInput,
        0,
        100,
        DEFAULT_VALUES.minSuitabilityScore,
      ),
      searchTerms,
      runBudget: toNumber(runBudgetInput, 1, 1000, DEFAULT_VALUES.runBudget),
    };
  }, [topNInput, minScoreInput, searchTerms, runBudgetInput]);

  const estimate = useMemo(
    () => calculateAutomaticEstimate({ values, sources: pipelineSources }),
    [values, pipelineSources],
  );
  const activePreset = useMemo<AutomaticPresetSelection>(
    () => getPresetSelection(values),
    [values],
  );

  const runDisabled =
    isPipelineRunning ||
    isSaving ||
    pipelineSources.length === 0 ||
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
              Sources ({pipelineSources.length}/{enabledSources.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {enabledSources.map((source) => (
              <Button
                key={source}
                type="button"
                size="sm"
                variant={
                  pipelineSources.includes(source) ? "default" : "outline"
                }
                onClick={() =>
                  onToggleSource(source, !pipelineSources.includes(source))
                }
              >
                {sourceLabel[source]}
              </Button>
            ))}
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
