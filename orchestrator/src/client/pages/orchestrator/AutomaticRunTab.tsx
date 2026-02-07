import type { AppSettings, JobSource } from "@shared/types";
import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sourceLabel } from "@/lib/utils";
import {
  AUTOMATIC_PRESETS,
  type AutomaticPresetId,
  type AutomaticRunValues,
  calculateAutomaticEstimate,
  loadAutomaticRunMemory,
  parseSearchTermsInput,
  saveAutomaticRunMemory,
  stringifySearchTerms,
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
  jobspyResultsWanted: 200,
  gradcrackerMaxJobsPerTerm: 50,
  ukvisajobsMaxJobs: 50,
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
  const [jobspyInput, setJobspyInput] = useState(
    String(DEFAULT_VALUES.jobspyResultsWanted),
  );
  const [gradcrackerInput, setGradcrackerInput] = useState(
    String(DEFAULT_VALUES.gradcrackerMaxJobsPerTerm),
  );
  const [ukvisaInput, setUkvisaInput] = useState(
    String(DEFAULT_VALUES.ukvisajobsMaxJobs),
  );
  const [searchTermsInput, setSearchTermsInput] = useState(
    stringifySearchTerms(DEFAULT_VALUES.searchTerms),
  );
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
    setJobspyInput(String(settings?.jobspyResultsWanted ?? DEFAULT_VALUES.jobspyResultsWanted));
    setGradcrackerInput(
      String(
        settings?.gradcrackerMaxJobsPerTerm ??
          DEFAULT_VALUES.gradcrackerMaxJobsPerTerm,
      ),
    );
    setUkvisaInput(String(settings?.ukvisajobsMaxJobs ?? DEFAULT_VALUES.ukvisajobsMaxJobs));
    setSearchTermsInput(
      stringifySearchTerms(settings?.searchTerms ?? DEFAULT_VALUES.searchTerms),
    );
    setActivePreset(null);
  }, [open, settings]);

  const values = useMemo<AutomaticRunValues>(() => {
    const searchTerms = parseSearchTermsInput(searchTermsInput);
    return {
      topN: toNumber(topNInput, 1, 50, DEFAULT_VALUES.topN),
      minSuitabilityScore: toNumber(
        minScoreInput,
        0,
        100,
        DEFAULT_VALUES.minSuitabilityScore,
      ),
      searchTerms,
      jobspyResultsWanted: toNumber(
        jobspyInput,
        1,
        1000,
        DEFAULT_VALUES.jobspyResultsWanted,
      ),
      gradcrackerMaxJobsPerTerm: toNumber(
        gradcrackerInput,
        1,
        1000,
        DEFAULT_VALUES.gradcrackerMaxJobsPerTerm,
      ),
      ukvisajobsMaxJobs: toNumber(
        ukvisaInput,
        1,
        1000,
        DEFAULT_VALUES.ukvisajobsMaxJobs,
      ),
    };
  }, [topNInput, minScoreInput, searchTermsInput, jobspyInput, gradcrackerInput, ukvisaInput]);

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
    setJobspyInput(String(preset.jobspyResultsWanted));
    setGradcrackerInput(String(preset.gradcrackerMaxJobsPerTerm));
    setUkvisaInput(String(preset.ukvisajobsMaxJobs));
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
            <Label htmlFor="top-n">Top N</Label>
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
            <Label htmlFor="jobspy-results">JobSpy results wanted</Label>
            <Input
              id="jobspy-results"
              type="number"
              min={1}
              max={1000}
              value={jobspyInput}
              onChange={(event) => setJobspyInput(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gradcracker-max">Gradcracker max jobs/term</Label>
            <Input
              id="gradcracker-max"
              type="number"
              min={1}
              max={1000}
              value={gradcrackerInput}
              onChange={(event) => setGradcrackerInput(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ukvisa-max">UKVisaJobs max jobs</Label>
            <Input
              id="ukvisa-max"
              type="number"
              min={1}
              max={1000}
              value={ukvisaInput}
              onChange={(event) => setUkvisaInput(event.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="search-terms">Search terms (comma or newline separated)</Label>
            <Textarea
              id="search-terms"
              value={searchTermsInput}
              onChange={(event) => setSearchTermsInput(event.target.value)}
              className="min-h-[96px]"
            />
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
            <strong>{estimate.processed.max}</strong> (limited by Top N)
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
