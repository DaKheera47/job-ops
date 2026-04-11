import * as api from "@client/api";
import type { ManualImportResult } from "@client/components/ManualImportFlow";
import { useSettings } from "@client/hooks/useSettings";
import { getCompatibleSourcesForCountry } from "@shared/location-support.js";
import type { AppSettings, JobSource } from "@shared/types.js";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { trackProductEvent } from "@/lib/analytics";
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
  handleManualImported: (result: ManualImportResult) => Promise<void>;
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
      trackProductEvent("jobs_pipeline_run_finished", {
        status: "cancelled",
        had_error_message: false,
      });
      toast.message("Pipeline cancelled");
      return;
    }

    if (pipelineTerminalEvent.status === "failed") {
      trackProductEvent("jobs_pipeline_run_finished", {
        status: "failed",
        had_error_message: Boolean(pipelineTerminalEvent.errorMessage),
      });
      toast.error(pipelineTerminalEvent.errorMessage || "Pipeline failed");
      return;
    }

    trackProductEvent("jobs_pipeline_run_finished", {
      status: "completed",
      had_error_message: false,
    });
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
      analytics?: {
        mode?: string;
        country?: string;
        hasCityLocations?: boolean;
        searchTermsCount?: number;
      };
    }) => {
      try {
        setIsPipelineRunning(true);
        setIsCancelling(false);
        trackProductEvent("jobs_pipeline_run_started", {
          mode: config.analytics?.mode ?? "automatic",
          source_count: config.sources.length,
          top_n: config.topN,
          min_suitability_score: config.minSuitabilityScore,
          country: config.analytics?.country,
          has_city_locations: config.analytics?.hasCityLocations,
          search_terms_count: config.analytics?.searchTermsCount,
        });
        await api.runPipeline({
          topN: config.topN,
          minSuitabilityScore: config.minSuitabilityScore,
          sources: config.sources,
        });
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
      trackProductEvent("jobs_pipeline_run_cancel_requested", {
        was_running: isPipelineRunning,
      });
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
      const searchCities = serializeCityLocationsSetting(values.cityLocations);
      await api.updateSettings({
        searchTerms: values.searchTerms,
        workplaceTypes: values.workplaceTypes,
        jobspyResultsWanted: limits.jobspyResultsWanted,
        gradcrackerMaxJobsPerTerm: limits.gradcrackerMaxJobsPerTerm,
        ukvisajobsMaxJobs: limits.ukvisajobsMaxJobs,
        adzunaMaxJobsPerTerm: limits.adzunaMaxJobsPerTerm,
        startupjobsMaxJobsPerTerm: limits.startupjobsMaxJobsPerTerm,
        jobspyCountryIndeed: values.country,
        searchCities,
      });
      await refreshSettings();
      await startPipelineRun({
        topN: values.topN,
        minSuitabilityScore: values.minSuitabilityScore,
        sources: compatibleSources,
        analytics: {
          mode: "automatic",
          country: values.country,
          hasCityLocations: values.cityLocations.length > 0,
          searchTermsCount: values.searchTerms.length,
        },
      });
      setIsRunModeModalOpen(false);
    },
    [pipelineSources, refreshSettings, startPipelineRun],
  );

  const handleManualImported = useCallback(
    async (imported: ManualImportResult) => {
      trackProductEvent("jobs_pipeline_run_started", {
        mode: "manual_import",
        manual_import_source: imported.source,
        manual_import_source_host: imported.sourceHost ?? undefined,
      });
      await loadJobs();
      navigateWithContext("ready", imported.jobId);
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
