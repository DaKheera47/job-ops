import NumberFlow from "@number-flow/react";
import type { PipelineProgressState } from "@shared/types";
import { CircleX } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PipelineActionRequired } from "./PipelineActionRequired";
import { PipelineFanoutCard } from "./PipelineFanoutCard";

const noop = () => {};

export interface PipelineProgressCardProps {
  progress: PipelineProgressState;
  elapsedSeconds?: number;
  currentCombination?: string;
  solvingExtractor?: string | null;
  onSolveChallenge?: (extractorId: string) => void;
  resumingScoring?: boolean;
  onResumeScoring?: () => void;
}

const stepTitles: Record<PipelineProgressState["step"], string> = {
  idle: "Preparing search",
  crawling: "Searching jobs",
  challenge_required: "Browser check needed",
  importing: "Importing jobs",
  scoring: "Scoring matches",
  processing: "Preparing applications",
  completed: "Search complete",
  cancelled: "Search cancelled",
  failed: "Pipeline failed",
  configuration_required: "Scoring paused",
};

const stepLabels: Record<PipelineProgressState["step"], string> = {
  idle: "Connecting",
  crawling: "Searching",
  challenge_required: "Check needed",
  importing: "Importing",
  scoring: "Scoring",
  processing: "Processing",
  completed: "Complete",
  cancelled: "Cancelled",
  failed: "Failed",
  configuration_required: "Action needed",
};

const Metric = ({ label, value }: { label: string; value: number }) => (
  <div className="flex flex-col gap-1 px-4 py-4">
    <span className="text-xs text-muted-foreground">{label}</span>
    <NumberFlow
      className="font-mono text-lg font-semibold tabular-nums"
      value={value}
      locales="en-GB"
      isolate
    />
  </div>
);

export const PipelineProgressCard = ({
  progress,
  elapsedSeconds,
  currentCombination,
  solvingExtractor = null,
  onSolveChallenge = () => {},
  resumingScoring = false,
  onResumeScoring,
}: PipelineProgressCardProps) => {
  if (
    progress.fanout &&
    (progress.step === "crawling" || progress.step === "challenge_required")
  ) {
    return (
      <PipelineFanoutCard
        fanout={progress.fanout}
        elapsedSeconds={elapsedSeconds ?? 0}
        currentCombination={currentCombination}
        challenges={progress.pendingChallenges}
        solvingExtractor={solvingExtractor}
        onSolveChallenge={onSolveChallenge}
      />
    );
  }

  const remaining = Math.max(
    progress.totalToProcess - progress.jobsProcessed,
    0,
  );
  const showMetrics = progress.step !== "idle";
  const badgeVariant =
    progress.step === "failed"
      ? "destructive"
      : progress.step === "completed"
        ? "secondary"
        : "outline";

  return (
    <Card className="w-full max-w-6xl overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <CardTitle className="text-2xl tracking-tight">
              {stepTitles[progress.step]}
              {elapsedSeconds !== undefined ? (
                <span className="ml-3 font-mono text-xs tabular-nums text-muted-foreground">
                  ({String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:
                  {String(elapsedSeconds % 60).padStart(2, "0")} elapsed)
                </span>
              ) : null}
            </CardTitle>
            <CardDescription className="text-base">
              {progress.message}
            </CardDescription>
            {progress.detail ? (
              <p className="text-xs text-muted-foreground">{progress.detail}</p>
            ) : null}
          </div>
          <Badge className="shrink-0" variant={badgeVariant}>
            {stepLabels[progress.step]}
          </Badge>
        </div>
      </CardHeader>

      {showMetrics || progress.error ? (
        <>
          <Separator />
          <CardContent className="flex flex-col gap-4 p-4 sm:p-5">
            {showMetrics ? (
              <section className="grid overflow-hidden rounded-xl border sm:grid-cols-4 sm:divide-x">
                <Metric label="Discovered" value={progress.jobsDiscovered} />
                <Metric label="Scored" value={progress.jobsScored} />
                <Metric label="Processed" value={progress.jobsProcessed} />
                <Metric label="Remaining" value={remaining} />
              </section>
            ) : null}

            {progress.step === "failed" && progress.error ? (
              <Alert variant="destructive">
                <CircleX />
                <AlertTitle>Pipeline stopped</AlertTitle>
                <AlertDescription>{progress.error}</AlertDescription>
              </Alert>
            ) : null}

            {progress.step === "configuration_required" && progress.error ? (
              <PipelineActionRequired
                title="LLM configuration required"
                description={progress.error}
                actionLabel="Restart scoring"
                pendingLabel="Resuming…"
                pending={resumingScoring}
                onAction={onResumeScoring ?? noop}
              />
            ) : null}
          </CardContent>
        </>
      ) : null}
    </Card>
  );
};
