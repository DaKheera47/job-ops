import type { AppSettings, JobSource } from "@shared/types";
import { X } from "lucide-react";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  onSetPipelineSources: (sources: JobSource[]) => void;
  isPipelineRunning: boolean;
  onSaveAndRun: (values: AutomaticRunValues) => Promise<void>;
}

const DEFAULT_VALUES: AutomaticRunValues = {
  topN: 10,
  minSuitabilityScore: 50,
  searchTerms: ["web developer"],
  jobsPerTerm: 200,
};

function toNumber(input: string, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
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
  const [topNInput, setTopNInput] = useState(String(DEFAULT_VALUES.topN));
  const [minScoreInput, setMinScoreInput] = useState(
    String(DEFAULT_VALUES.minSuitabilityScore),
  );
  const [jobsPerTermInput, setJobsPerTermInput] = useState(
    String(DEFAULT_VALUES.jobsPerTerm),
  );
  const [searchTerms, setSearchTerms] = useState<string[]>(
    DEFAULT_VALUES.searchTerms,
  );
  const [searchTermDraft, setSearchTermDraft] = useState("");
  const [activePreset, setActivePreset] = useState<AutomaticPresetId | null>(
    null,
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const memory = loadAutomaticRunMemory();
    const topN = memory?.topN ?? DEFAULT_VALUES.topN;
    const minSuitabilityScore =
      memory?.minSuitabilityScore ?? DEFAULT_VALUES.minSuitabilityScore;

    setTopNInput(String(topN));
    setMinScoreInput(String(minSuitabilityScore));
    const rememberedJobsPerTerm =
      settings?.jobspyResultsWanted ??
      settings?.gradcrackerMaxJobsPerTerm ??
      settings?.ukvisajobsMaxJobs ??
      DEFAULT_VALUES.jobsPerTerm;
    setJobsPerTermInput(String(rememberedJobsPerTerm));
    setSearchTerms(settings?.searchTerms ?? DEFAULT_VALUES.searchTerms);
    setSearchTermDraft("");
    setActivePreset(null);
  }, [open, settings]);

  const addSearchTerms = (input: string) => {
    const parsed = parseSearchTermsInput(input);
    if (parsed.length === 0) return;
    setSearchTerms((current) => {
      const next = [...current];
      for (const term of parsed) {
        if (!next.includes(term)) next.push(term);
      }
      return next;
    });
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
      jobsPerTerm: toNumber(
        jobsPerTermInput,
        1,
        1000,
        DEFAULT_VALUES.jobsPerTerm,
      ),
    };
  }, [topNInput, minScoreInput, searchTerms, jobsPerTermInput]);

  const estimate = useMemo(
    () => calculateAutomaticEstimate({ values, sources: pipelineSources }),
    [values, pipelineSources],
  );

  const runDisabled =
    isPipelineRunning ||
    isSaving ||
    pipelineSources.length === 0 ||
    values.searchTerms.length === 0;

  const applyPreset = (presetId: AutomaticPresetId) => {
    const preset = AUTOMATIC_PRESETS[presetId];
    setTopNInput(String(preset.topN));
    setMinScoreInput(String(preset.minSuitabilityScore));
    setJobsPerTermInput(String(preset.jobsPerTerm));
    setActivePreset(presetId);
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
    <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Presets</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Run settings</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="top-n">Jobs to auto-process</Label>
            <Input
              id="top-n"
              type="number"
              min={1}
              max={50}
              value={topNInput}
              onChange={(event) => setTopNInput(event.target.value)}
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
              onChange={(event) => setMinScoreInput(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="jobs-per-term">Jobs per term</Label>
            <Input
              id="jobs-per-term"
              type="number"
              min={1}
              max={1000}
              value={jobsPerTermInput}
              onChange={(event) => setJobsPerTermInput(event.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="search-terms-input">Search terms</Label>
            <div className="rounded-md border border-input bg-background px-2 py-2">
              <div className="flex flex-wrap gap-2">
                {searchTerms.map((term) => (
                  <span
                    key={term}
                    className="inline-flex items-center gap-1 rounded-full border border-border/80 bg-muted/30 px-2 py-1 text-xs"
                  >
                    {term}
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Remove ${term}`}
                      onClick={() =>
                        setSearchTerms((current) =>
                          current.filter((value) => value !== term),
                        )
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <Input
                  id="search-terms-input"
                  value={searchTermDraft}
                  onChange={(event) => setSearchTermDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === ",") {
                      event.preventDefault();
                      addSearchTerms(searchTermDraft);
                      setSearchTermDraft("");
                      return;
                    }
                    if (
                      event.key === "Backspace" &&
                      searchTermDraft.length === 0 &&
                      searchTerms.length > 0
                    ) {
                      setSearchTerms((current) => current.slice(0, -1));
                    }
                  }}
                  onBlur={() => {
                    addSearchTerms(searchTermDraft);
                    setSearchTermDraft("");
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
                  className="h-8 min-w-[180px] flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Sources ({pipelineSources.length}/{enabledSources.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {enabledSources.map((source) => (
            <Button
              key={source}
              type="button"
              size="sm"
              variant={pipelineSources.includes(source) ? "default" : "outline"}
              onClick={() =>
                onToggleSource(source, !pipelineSources.includes(source))
              }
            >
              {sourceLabel[source]}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onSetPipelineSources(enabledSources)}
            disabled={enabledSources.length === 0}
          >
            Select all
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Estimate</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            Estimated discovered jobs: <strong>{estimate.discovered.min}</strong>
            {" - "}
            <strong>{estimate.discovered.max}</strong> (cap {estimate.discovered.cap})
          </p>
          <p>
            Estimated auto-processed: <strong>{estimate.processed.min}</strong>
            {" - "}
            <strong>{estimate.processed.max}</strong> (limited by jobs to auto-process)
          </p>
          <p className="text-xs text-muted-foreground">
            Estimate is based on configured caps and historical yield assumptions.
          </p>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 flex justify-end bg-background/95 pb-1 pt-2 backdrop-blur">
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
          Save + Run automatic
        </Button>
      </div>
    </div>
  );
};
