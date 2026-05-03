import * as api from "@client/api";
import { ListItem } from "@client/components/layout";
import { PipelineProgress } from "@client/components/PipelineProgress";
import { queryKeys } from "@client/lib/queryKeys";
import { sourceLabel } from "@shared/extractors";
import type { PipelineRun, PipelineRunInsights } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertCircle,
  Clock3,
  GitCompareArrows,
  History,
  Loader2,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/utils";
import {
  formatPipelineDuration,
  getPipelineRunDisplayStatus,
  getPipelineRunStatusLabel,
  type PipelineRunDisplayStatus,
} from "./pipelineRuns";

const RECENT_RUN_LIMIT = 8;

const statusBadgeClasses: Record<PipelineRunDisplayStatus, string> = {
  running: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  completed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  failed: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  cancelled: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  incomplete: "border-slate-500/30 bg-slate-500/10 text-slate-200",
};

function getDurationMs(run: PipelineRun): number | null {
  if (run.completedAt == null) return null;
  return Math.max(
    0,
    new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime(),
  );
}

function getRunReason(
  run: PipelineRun,
  displayStatus: PipelineRunDisplayStatus,
) {
  if (run.errorMessage) return run.errorMessage;
  if (displayStatus === "cancelled") return "Run cancelled before completion.";
  if (displayStatus === "incomplete") {
    return "This historical run never recorded a completion timestamp.";
  }
  return null;
}

function MetricCard(props: {
  label: string;
  value: React.ReactNode;
  hint?: string | null;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {props.value}
      </div>
      {props.hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{props.hint}</div>
      ) : null}
    </div>
  );
}

function RunStatusBadge(props: { status: PipelineRunDisplayStatus }) {
  return (
    <Badge variant="outline" className={statusBadgeClasses[props.status]}>
      {getPipelineRunStatusLabel(props.status)}
    </Badge>
  );
}

function formatSourceList(sources: string[]) {
  if (sources.length === 0) return "None";
  return sources.join(", ");
}

function formatToggleState(value: boolean) {
  return value ? "Enabled" : "Disabled";
}

function formatStageLabel(stage: string) {
  return stage.replace(/_/g, " ");
}

function RunsList(props: {
  runs: PipelineRun[];
  activeRunId: string | null;
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[minmax(0,1.6fr)_auto_auto_auto] gap-3 px-3 text-xs text-muted-foreground md:grid">
        <div>Run</div>
        <div>Status</div>
        <div>Discovered</div>
        <div>Processed</div>
      </div>

      <div className="space-y-2">
        {props.runs.map((run) => {
          const displayStatus = getPipelineRunDisplayStatus(run, {
            isActive: props.activeRunId === run.id,
          });
          const duration = formatPipelineDuration(getDurationMs(run));
          const isSelected = props.selectedRunId === run.id;

          return (
            <ListItem
              key={run.id}
              onClick={() => props.onSelectRun(run.id)}
              selected={isSelected}
              className={`grid gap-3 rounded-lg border px-3 py-3 md:grid-cols-[minmax(0,1.6fr)_auto_auto_auto] ${
                isSelected
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/60 hover:bg-muted/30"
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {formatDateTime(run.startedAt) ?? run.startedAt}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Run {run.id.slice(0, 8)}
                  </span>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Duration {duration}
                </div>
              </div>
              <div className="md:self-center">
                <RunStatusBadge status={displayStatus} />
              </div>
              <div className="md:self-center md:text-right">
                <div className="text-xs text-muted-foreground md:hidden">
                  Discovered
                </div>
                <div className="font-medium tabular-nums">
                  {run.jobsDiscovered.toLocaleString()}
                </div>
              </div>
              <div className="md:self-center md:text-right">
                <div className="text-xs text-muted-foreground md:hidden">
                  Processed
                </div>
                <div className="font-medium tabular-nums">
                  {run.jobsProcessed.toLocaleString()}
                </div>
              </div>
            </ListItem>
          );
        })}
      </div>
    </div>
  );
}

function RunInsightsBody(props: {
  insights: PipelineRunInsights;
  isActiveRun: boolean;
}) {
  const { run, exactMetrics, inferredMetrics } = props.insights;
  const savedDetails = props.insights.savedDetails;
  const displayStatus = getPipelineRunDisplayStatus(run, {
    isActive: props.isActiveRun,
  });
  const runReason = getRunReason(run, displayStatus);
  const inferredHint =
    inferredMetrics.jobsCreated.quality === "unavailable"
      ? "Unavailable for incomplete runs."
      : "Approximate counts inferred from job timestamps in the run window. Other job activity in the same period may be included.";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={displayStatus} />
        <span className="text-sm text-muted-foreground">
          Started {formatDateTime(run.startedAt) ?? run.startedAt}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Duration"
          value={formatPipelineDuration(exactMetrics.durationMs)}
        />
        <MetricCard
          label="Jobs discovered"
          value={run.jobsDiscovered.toLocaleString()}
        />
        <MetricCard
          label="Jobs processed"
          value={run.jobsProcessed.toLocaleString()}
        />
        <MetricCard
          label="Completed"
          value={formatDateTime(run.completedAt) ?? "Not recorded"}
        />
      </div>

      {runReason ? (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm">
          <div className="font-medium">Notes</div>
          <div className="mt-1 text-muted-foreground">{runReason}</div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="font-medium">Saved settings</div>
        {savedDetails ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="text-sm font-medium">Requested run</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MetricCard
                  label="Top N"
                  value={savedDetails.requestedConfig.topN.toLocaleString()}
                />
                <MetricCard
                  label="Min suitability score"
                  value={savedDetails.requestedConfig.minSuitabilityScore.toLocaleString()}
                />
                <MetricCard
                  label="Sources"
                  value={formatSourceList(
                    savedDetails.requestedConfig.sources.map(sourceLabel),
                  )}
                />
                <MetricCard
                  label="Crawling"
                  value={formatToggleState(
                    savedDetails.requestedConfig.enableCrawling,
                  )}
                />
                <MetricCard
                  label="Scoring"
                  value={formatToggleState(
                    savedDetails.requestedConfig.enableScoring,
                  )}
                />
                <MetricCard
                  label="Importing"
                  value={formatToggleState(
                    savedDetails.requestedConfig.enableImporting,
                  )}
                />
                <MetricCard
                  label="Auto tailoring"
                  value={formatToggleState(
                    savedDetails.requestedConfig.enableAutoTailoring,
                  )}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="text-sm font-medium">Effective settings</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MetricCard
                  label="Country"
                  value={
                    savedDetails.effectiveConfig.countryLabel ??
                    "Not restricted"
                  }
                />
                <MetricCard
                  label="Cities"
                  value={
                    savedDetails.effectiveConfig.searchCities.length > 0
                      ? savedDetails.effectiveConfig.searchCities.join(", ")
                      : "Not restricted"
                  }
                />
                <MetricCard
                  label="Workplace types"
                  value={
                    savedDetails.effectiveConfig.workplaceTypes.length > 0
                      ? savedDetails.effectiveConfig.workplaceTypes.join(", ")
                      : "Not restricted"
                  }
                />
                <MetricCard
                  label="Location matching"
                  value={`${formatStageLabel(
                    savedDetails.effectiveConfig.locationSearchScope,
                  )}; ${formatStageLabel(
                    savedDetails.effectiveConfig.locationMatchStrictness,
                  )}`}
                />
                <MetricCard
                  label="Compatible sources"
                  value={formatSourceList(
                    savedDetails.effectiveConfig.compatibleSources.map(
                      sourceLabel,
                    ),
                  )}
                />
                <MetricCard
                  label="Skipped sources"
                  value={
                    savedDetails.effectiveConfig.skippedSources.length > 0
                      ? savedDetails.effectiveConfig.skippedSources
                          .map((entry) => sourceLabel(entry.source))
                          .join(", ")
                      : "None"
                  }
                  hint={
                    savedDetails.effectiveConfig.skippedSources.length > 0
                      ? savedDetails.effectiveConfig.skippedSources
                          .map((entry) => entry.reason)
                          .join(" ")
                      : null
                  }
                />
                <MetricCard
                  label="Search terms"
                  value={savedDetails.effectiveConfig.searchTermsCount.toLocaleString()}
                />
                <MetricCard
                  label="Blocked company filters"
                  value={savedDetails.effectiveConfig.blockedCompanyKeywordsCount.toLocaleString()}
                />
                <MetricCard
                  label="Auto-skip threshold"
                  value={
                    savedDetails.effectiveConfig.autoSkipScoreThreshold == null
                      ? "Off"
                      : savedDetails.effectiveConfig.autoSkipScoreThreshold.toLocaleString()
                  }
                />
                <MetricCard
                  label="PDF renderer"
                  value={savedDetails.effectiveConfig.pdfRenderer}
                />
                <MetricCard
                  label="Source limits"
                  value={`Indeed ${savedDetails.effectiveConfig.sourceLimits.jobspyResultsWanted}; UK Visa Jobs ${savedDetails.effectiveConfig.sourceLimits.ukvisajobsMaxJobs}`}
                  hint={`Adzuna ${savedDetails.effectiveConfig.sourceLimits.adzunaMaxJobsPerTerm}; Gradcracker ${savedDetails.effectiveConfig.sourceLimits.gradcrackerMaxJobsPerTerm}; startup.jobs ${savedDetails.effectiveConfig.sourceLimits.startupjobsMaxJobsPerTerm}; Jobindex ${savedDetails.effectiveConfig.sourceLimits.jobindexMaxJobsPerTerm}`}
                />
                <MetricCard
                  label="Resume projects"
                  value={`${savedDetails.effectiveConfig.resumeProjects.maxProjects} max`}
                  hint={`${savedDetails.effectiveConfig.resumeProjects.lockedProjectCount} locked, ${savedDetails.effectiveConfig.resumeProjects.aiSelectableProjectCount} AI-selectable`}
                />
                <MetricCard
                  label="Models"
                  value={savedDetails.effectiveConfig.models.scorer}
                  hint={`Tailoring ${savedDetails.effectiveConfig.models.tailoring}; project selection ${savedDetails.effectiveConfig.models.projectSelection}`}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
              <div className="text-sm font-medium">Saved execution summary</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <MetricCard
                  label="Last recorded stage"
                  value={formatStageLabel(savedDetails.resultSummary.stage)}
                />
                <MetricCard
                  label="Jobs scored"
                  value={
                    savedDetails.resultSummary.jobsScored == null
                      ? "Not recorded"
                      : savedDetails.resultSummary.jobsScored.toLocaleString()
                  }
                />
                <MetricCard
                  label="Jobs selected"
                  value={
                    savedDetails.resultSummary.jobsSelected == null
                      ? "Not recorded"
                      : savedDetails.resultSummary.jobsSelected.toLocaleString()
                  }
                />
                <MetricCard
                  label="Source errors"
                  value={savedDetails.resultSummary.sourceErrors.length.toLocaleString()}
                />
              </div>
              {savedDetails.resultSummary.sourceErrors.length > 0 ? (
                <div className="mt-3 rounded-lg border border-border/60 bg-background/40 p-3 text-sm text-muted-foreground">
                  {savedDetails.resultSummary.sourceErrors.join(" ")}
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3 text-sm text-muted-foreground">
            Saved run settings are available for newer pipeline runs.
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="font-medium">What changed</div>
          <Badge variant="outline">Inferred from timestamps</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{inferredHint}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Jobs created"
            value={
              inferredMetrics.jobsCreated.value == null
                ? "Not available"
                : inferredMetrics.jobsCreated.value.toLocaleString()
            }
          />
          <MetricCard
            label="Jobs updated"
            value={
              inferredMetrics.jobsUpdated.value == null
                ? "Not available"
                : inferredMetrics.jobsUpdated.value.toLocaleString()
            }
          />
          <MetricCard
            label="Jobs processed"
            value={
              inferredMetrics.jobsProcessed.value == null
                ? "Not available"
                : inferredMetrics.jobsProcessed.value.toLocaleString()
            }
          />
        </div>
      </div>
    </div>
  );
}

export const OverviewPipelineRunsSection: React.FC = () => {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const pipelineStatusQuery = useQuery({
    queryKey: queryKeys.pipeline.status(),
    queryFn: api.getPipelineStatus,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });
  const pipelineRunsQuery = useQuery({
    queryKey: queryKeys.pipeline.runs(),
    queryFn: api.getPipelineRuns,
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });
  const runInsightsQuery = useQuery({
    queryKey: queryKeys.pipeline.runInsights(selectedRunId ?? ""),
    queryFn: () => api.getPipelineRunInsights(selectedRunId as string),
    enabled: selectedRunId != null,
  });

  const recentRuns = useMemo(
    () => (pipelineRunsQuery.data ?? []).slice(0, RECENT_RUN_LIMIT),
    [pipelineRunsQuery.data],
  );
  const latestRun = pipelineStatusQuery.data?.lastRun ?? recentRuns[0] ?? null;
  const activeRunId = pipelineStatusQuery.data?.isRunning
    ? (latestRun?.id ?? null)
    : null;
  const currentStatus = latestRun
    ? getPipelineRunDisplayStatus(latestRun, {
        isActive: activeRunId === latestRun.id,
      })
    : null;
  const currentStatusText = pipelineStatusQuery.data?.isRunning
    ? "A pipeline run is currently in progress."
    : latestRun
      ? (getRunReason(latestRun, currentStatus as PipelineRunDisplayStatus) ??
        "The most recent pipeline activity is shown below.")
      : "No pipeline runs recorded yet.";
  const selectedRun = useMemo(
    () =>
      (pipelineRunsQuery.data ?? []).find((run) => run.id === selectedRunId) ??
      (latestRun?.id === selectedRunId ? latestRun : null),
    [latestRun, pipelineRunsQuery.data, selectedRunId],
  );

  const isLoading =
    pipelineStatusQuery.isLoading ||
    pipelineRunsQuery.isLoading ||
    (selectedRunId != null && runInsightsQuery.isLoading);
  const error =
    pipelineStatusQuery.error ??
    pipelineRunsQuery.error ??
    runInsightsQuery.error;
  const statusError = pipelineStatusQuery.error;
  const runsError = pipelineRunsQuery.error;

  return (
    <>
      <Card className="border-border/60 bg-card/40 shadow-none">
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Pipeline runs</CardTitle>
              </div>
              <CardDescription>
                Review recent pipeline activity without leaving Overview.
              </CardDescription>
            </div>
            {currentStatus ? <RunStatusBadge status={currentStatus} /> : null}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {pipelineStatusQuery.data?.isRunning ? (
            <PipelineProgress isRunning />
          ) : null}

          {isLoading && !latestRun && recentRuns.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading pipeline history…</span>
            </div>
          ) : null}

          {error && !latestRun && recentRuns.length === 0 ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {error instanceof Error
                ? error.message
                : "Failed to load pipeline history"}
            </div>
          ) : null}

          {latestRun ? (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,2fr)]">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <span>Current status</span>
                  </div>
                  {statusError ? (
                    <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      Live status is temporarily unavailable. Showing the latest
                      persisted run history.
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {currentStatus ? (
                      <RunStatusBadge status={currentStatus} />
                    ) : null}
                    <span className="text-sm text-muted-foreground">
                      {currentStatusText}
                    </span>
                  </div>
                  {pipelineStatusQuery.data?.nextScheduledRun ? (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Next scheduled run{" "}
                      {formatDateTime(
                        pipelineStatusQuery.data.nextScheduledRun,
                      ) ?? pipelineStatusQuery.data.nextScheduledRun}
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    label="Last run"
                    value={
                      formatDateTime(latestRun.startedAt) ?? latestRun.startedAt
                    }
                  />
                  <MetricCard
                    label="Duration"
                    value={formatPipelineDuration(getDurationMs(latestRun))}
                  />
                  <MetricCard
                    label="Jobs discovered"
                    value={latestRun.jobsDiscovered.toLocaleString()}
                  />
                  <MetricCard
                    label="Jobs processed"
                    value={latestRun.jobsProcessed.toLocaleString()}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-muted-foreground" />
                  <div className="font-medium">Recent runs</div>
                </div>
                {runsError ? (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    Recent run history could not be refreshed just now.
                  </div>
                ) : null}
                <RunsList
                  runs={recentRuns}
                  activeRunId={activeRunId}
                  selectedRunId={selectedRunId}
                  onSelectRun={setSelectedRunId}
                />
              </div>
            </>
          ) : null}

          {!isLoading && !error && !latestRun ? (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center">
              <div className="font-medium">No pipeline runs yet</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Once the pipeline runs, this section will show status, recent
                history, and inferred changes.
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Sheet
        open={selectedRunId != null}
        onOpenChange={(open) => {
          if (!open) setSelectedRunId(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <GitCompareArrows className="h-4 w-4" />
              Run details
            </SheetTitle>
            <SheetDescription>
              {selectedRun
                ? `Inspect exact and inferred signals for run ${selectedRun.id.slice(
                    0,
                    8,
                  )}.`
                : "Inspect exact and inferred signals for the selected run."}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6">
            {runInsightsQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading run details…</span>
              </div>
            ) : null}

            {runInsightsQuery.error ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {runInsightsQuery.error instanceof Error
                  ? runInsightsQuery.error.message
                  : "Failed to load run details"}
              </div>
            ) : null}

            {runInsightsQuery.data ? (
              <RunInsightsBody
                insights={runInsightsQuery.data}
                isActiveRun={activeRunId === runInsightsQuery.data.run.id}
              />
            ) : null}

            {!runInsightsQuery.isLoading &&
            !runInsightsQuery.error &&
            selectedRunId != null &&
            !runInsightsQuery.data ? (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span>Run details unavailable</span>
                </div>
                <div className="mt-2">
                  The selected run could not be loaded. Try selecting it again.
                </div>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
