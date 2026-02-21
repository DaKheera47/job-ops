import * as api from "@client/api";
import { useSettings } from "@client/hooks/useSettings";
import {
  formatCountryLabel,
  getCompatibleSourcesForCountry,
} from "@shared/location-support.js";
import type { AppSettings, JobSource } from "@shared/types.js";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { AutomaticRunValues } from "./automatic-run";
import {
  deriveExtractorLimits,
  serializeCityLocationsSetting,
} from "./automatic-run";
import type { RunMode } from "./run-mode";

type UsePipelineControlsArgs = {
  isPipelineRunning: boolean;
  setIsPipelineRunning: (value: boolean) => void;
  pipelineTerminalEvent: { status: string; errorMessage: string | null } | null;
  pipelineSources: JobSource[];
  loadJobs: () => Promise<void>;
  navigateWithContext: (
    newTab: string,
    newJobId?: string | null,
    isReplace?: boolean,
  ) => void;
};

export type UsePipelineControlsResult = {
  isRunModeModalOpen: boolean;
  setIsRunModeModalOpen: (open: boolean) => void;
  runMode: RunMode;
  setRunMode: (mode: RunMode) => void;
  isCancelling: boolean;
  openRunMode: (mode: RunMode) => void;
  handleCancelPipeline: () => Promise<void>;
  handleSaveAndRunAutomatic: (values: AutomaticRunValues) => Promise<void>;
  handleManualImported: (importedJobId: string) => Promise<void>;
  refreshSettings: () => Promise<AppSettings | null>;
};

export function usePipelineControls(
  args: UsePipelineControlsArgs,
): UsePipelineControlsResult {
  const {
    isPipelineRunning,
    setIsPipelineRunning,
    pipelineTerminalEvent,
    pipelineSources,
    loadJobs,
    navigateWithContext,
  } = args;

  const [isRunModeModalOpen, setIsRunModeModalOpen] = useState(false);
  const [runMode, setRunMode] = useState<RunMode>("automatic");
  const [isCancelling, setIsCancelling] = useState(false);

  const { refreshSettings } = useSettings();

  useEffect(() => {
    if (!pipelineTerminalEvent) return;
    setIsPipelineRunning(false);
    setIsCancelling(false);

    if (pipelineTerminalEvent.status === "cancelled") {
      toast.message("Pipeline cancelled");
      return;
    }

    if (pipelineTerminalEvent.status === "failed") {
      toast.error(pipelineTerminalEvent.errorMessage || "Pipeline failed");
      return;
    }

    toast.success("Pipeline completed");
  }, [pipelineTerminalEvent, setIsPipelineRunning]);

  const openRunMode = useCallback((mode: RunMode) => {
    setRunMode(mode);
    setIsRunModeModalOpen(true);
  }, []);

  const startPipelineRun = useCallback(
    async (config: {
      topN: number;
      minSuitabilityScore: number;
      sources: JobSource[];
    }) => {
      try {
        setIsPipelineRunning(true);
        setIsCancelling(false);
        await api.runPipeline(config);
        toast.message("Pipeline started", {
          description: `Sources: ${config.sources.join(", ")}. This may take a few minutes.`,
        });
      } catch (error) {
        setIsPipelineRunning(false);
        setIsCancelling(false);
        const message =
          error instanceof Error ? error.message : "Failed to start pipeline";
        toast.error(message);
      }
    },
    [setIsPipelineRunning],
  );

  const handleCancelPipeline = useCallback(async () => {
    if (isCancelling || !isPipelineRunning) return;

    try {
      setIsCancelling(true);
      const result = await api.cancelPipeline();
      toast.message(result.message);
    } catch (error) {
      setIsCancelling(false);
      const message =
        error instanceof Error ? error.message : "Failed to cancel pipeline";
      toast.error(message);
    }
  }, [isCancelling, isPipelineRunning]);

  const handleSaveAndRunAutomatic = useCallback(
    async (values: AutomaticRunValues) => {
      const compatibleSources = getCompatibleSourcesForCountry(
        pipelineSources,
        values.country,
      );
      if (compatibleSources.length === 0) {
        toast.error(
          "No compatible sources for the selected country. Choose another country or source.",
        );
        return;
      }

      const limits = deriveExtractorLimits({
        budget: values.runBudget,
        searchTerms: values.searchTerms,
        sources: compatibleSources,
      });
      const hasJobSpySite = compatibleSources.some(
        (source) =>
          source === "indeed" ||
          source === "linkedin" ||
          source === "glassdoor",
      );
      const hasAdzuna = compatibleSources.includes("adzuna");
      const hasHiringCafe = compatibleSources.includes("hiringcafe");
      const serializedCities = serializeCityLocationsSetting(
        values.cityLocations,
      );
      const searchCities =
        (hasJobSpySite || hasAdzuna || hasHiringCafe) && serializedCities
          ? serializedCities
          : formatCountryLabel(values.country);
      await api.updateSettings({
        searchTerms: values.searchTerms,
        jobspyResultsWanted: limits.jobspyResultsWanted,
        gradcrackerMaxJobsPerTerm: limits.gradcrackerMaxJobsPerTerm,
        ukvisajobsMaxJobs: limits.ukvisajobsMaxJobs,
        adzunaMaxJobsPerTerm: limits.adzunaMaxJobsPerTerm,
        jobspyCountryIndeed: values.country,
        searchCities,
      });
      await refreshSettings();
      await startPipelineRun({
        topN: values.topN,
        minSuitabilityScore: values.minSuitabilityScore,
        sources: compatibleSources,
      });
      setIsRunModeModalOpen(false);
    },
    [pipelineSources, refreshSettings, startPipelineRun],
  );

  const handleManualImported = useCallback(
    async (importedJobId: string) => {
      await loadJobs();
      navigateWithContext("ready", importedJobId);
    },
    [loadJobs, navigateWithContext],
  );

  return {
    isRunModeModalOpen,
    setIsRunModeModalOpen,
    runMode,
    setRunMode,
    isCancelling,
    openRunMode,
    handleCancelPipeline,
    handleSaveAndRunAutomatic,
    handleManualImported,
    refreshSettings,
  };
}
