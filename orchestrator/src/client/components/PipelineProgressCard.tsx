import NumberFlow from "@number-flow/react";
import type { PipelineProgressState } from "@shared/types";
import { CircleX, Loader2, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { PipelineFanoutCard } from "./PipelineFanoutCard";

type Transport = "connecting" | "live" | "polling";

export interface PipelineProgressCardProps {
  progress: PipelineProgressState;
  elapsedSeconds?: number;
  currentCombination?: string;
  transport?: Transport;
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

const transportLabels: Record<Transport, string> = {
  connecting: "Connecting…",
  live: "Live",
  polling: "Updating…",
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const getPercentage = (progress: PipelineProgressState): number => {
  switch (progress.step) {
    case "challenge_required":
      return 15;
    case "crawling":
      return progress.crawlingTermsTotal > 0
        ? clamp(
            5 +
              (progress.crawlingTermsProcessed / progress.crawlingTermsTotal) *
                10,
            5,
            15,
          )
        : 5;
    case "importing":
      return 20;
    case "scoring":
      return progress.jobsDiscovered > 0
        ? clamp(
            20 + (progress.jobsScored / progress.jobsDiscovered) * 30,
            20,
            50,
          )
        : 25;
    case "processing":
      return progress.totalToProcess > 0
        ? clamp(
            50 + (progress.jobsProcessed / progress.totalToProcess) * 50,
            50,
            100,
          )
        : 55;
    case "completed":
    case "cancelled":
    case "failed":
    case "configuration_required":
      return 100;
    default:
      return 0;
  }
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
  transport = "live",
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

  const percentage = getPercentage(progress);
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
      <CardHeader className="gap-6 p-6 sm:p-8">
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
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={badgeVariant}>{stepLabels[progress.step]}</Badge>
            <span className="text-xs text-muted-foreground">
              {transportLabels[transport]}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Overall progress</span>
            <span className="font-mono tabular-nums">
              {Math.round(percentage)}%
            </span>
          </div>
          <Progress
            value={percentage}
            aria-label={`${stepLabels[progress.step]}: ${Math.round(percentage)}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percentage)}
          />
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
              <Alert variant="warning">
                <ShieldAlert />
                <AlertTitle>LLM configuration required</AlertTitle>
                <AlertDescription className="flex flex-col gap-3">
                  <p>{progress.error}</p>
                  {onResumeScoring ? (
                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resumingScoring}
                        onClick={onResumeScoring}
                      >
                        {resumingScoring ? (
                          <Loader2 data-icon="inline-start" />
                        ) : null}
                        {resumingScoring ? "Resuming…" : "Restart scoring"}
                      </Button>
                    </div>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </>
      ) : null}
    </Card>
  );
};
