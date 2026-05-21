import type { Job } from "@shared/types.js";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./AnimatedNumber";
import { FitAssessmentContent } from "./FitAssessmentContent";

const getSuitabilityScoreTokens = (
  score: number | null,
  isAwaitingAi = false,
) => {
  if (score === null && isAwaitingAi) {
    return {
      shell: "border-blue-300/55 bg-blue-500/10 text-blue-200",
      value: "loading",
      label: "AI is still tailoring and scoring this job.",
    };
  }

  if (score === null) {
    return {
      shell: "border-destructive/40 bg-destructive/10 text-destructive",
      value: "!",
      label:
        "AI misconfiguration or service error. Please check your settings and AI service status.",
    };
  }

  if (score >= 70) {
    return {
      shell: "border-emerald-400/60 bg-emerald-500/10 text-emerald-100",
      value: `${Math.round(score)}`,
      label: `Suitability score ${Math.round(score)}`,
    };
  }

  if (score >= 60) {
    return {
      shell: "border-amber-400/60 bg-amber-500/10 text-amber-100",
      value: `${Math.round(score)}`,
      label: `Suitability score ${Math.round(score)}`,
    };
  }

  return {
    shell: "border-slate-500/55 bg-slate-500/10 text-slate-200",
    value: `${Math.round(score)}`,
    label: `Suitability score ${Math.round(score)}`,
  };
};

export function isAwaitingAiScore(
  job: Pick<Job, "status" | "suitabilityScore">,
): boolean {
  if (job.suitabilityScore != null) return false;
  return job.status === "processing";
}

export const ScoreRing: React.FC<{
  score: number | null;
  size?: "sm" | "lg";
  isAwaitingAi?: boolean;
  suitabilityReason?: string | null;
  jobId?: string;
}> = ({
  score,
  size = "lg",
  isAwaitingAi = false,
  suitabilityReason,
  jobId,
}) => {
  const tokens = getSuitabilityScoreTokens(score, isAwaitingAi);
  const isLoading = score === null && isAwaitingAi;
  const hasReason = !!suitabilityReason;

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  const handleTooltipOpenChange = (open: boolean) => {
    if (popoverOpen) {
      setTooltipOpen(false);
    } else {
      setTooltipOpen(open);
    }
  };

  const handlePopoverOpenChange = (open: boolean) => {
    setPopoverOpen(open);
    if (open) {
      setTooltipOpen(false);
    }
  };

  if (!hasReason) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              role="img"
              aria-label={tokens.label}
              className={cn(
                "relative overflow-visible",
                size === "sm"
                  ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 p-1"
                  : "flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 p-1",
                tokens.shell,
              )}
            >
              <motion.span
                key={`${jobId}-${score}`}
                className={cn(
                  "absolute inset-0 rounded-full border-2 pointer-events-none",
                  tokens.shell,
                )}
                initial={{ scale: 1, opacity: 0.8 }}
                animate={{ scale: 1.4, opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
              <div className="relative z-10 flex h-full w-full flex-col items-center justify-center rounded-full border border-white/5 bg-background/70 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div
                  className={cn(
                    size === "sm" ? "text-lg" : "text-2xl",
                    "font-semibold leading-none tabular-nums",
                  )}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : score === null ? (
                    tokens.value
                  ) : (
                    <AnimatedNumber>{Math.round(score)}</AnimatedNumber>
                  )}
                </div>
                {size === "lg" && (
                  <div className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-current/70">
                    score
                  </div>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-60 text-xs">
            {tokens.label}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
      <TooltipProvider delayDuration={0}>
        <Tooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="View fit assessment"
                className={cn(
                  "relative overflow-visible",
                  size === "sm"
                    ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 p-1"
                    : "flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 p-1",
                  tokens.shell,
                  "transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  score !== null &&
                    (score >= 70
                      ? "hover:shadow-[0_0_15px_rgba(16,185,129,0.45)] hover:border-emerald-400/80"
                      : score >= 60
                        ? "hover:shadow-[0_0_15px_rgba(245,158,11,0.45)] hover:border-amber-400/80"
                        : "hover:shadow-[0_0_15px_rgba(148,163,184,0.45)] hover:border-slate-400/80"),
                )}
              >
                <motion.span
                  key={`${jobId}-${score}`}
                  className={cn(
                    "absolute inset-0 rounded-full border-2 pointer-events-none",
                    tokens.shell,
                  )}
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 1.4, opacity: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
                <div className="relative z-10 flex h-full w-full flex-col items-center justify-center rounded-full border border-white/5 bg-background/70 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <div
                    className={cn(
                      size === "sm" ? "text-lg" : "text-2xl",
                      "font-semibold leading-none tabular-nums",
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : score === null ? (
                      tokens.value
                    ) : (
                      <AnimatedNumber>{Math.round(score)}</AnimatedNumber>
                    )}
                  </div>
                  {size === "lg" && (
                    <div className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-current/70">
                      score
                    </div>
                  )}
                </div>
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Find out why
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-96 rounded-xl border border-border/80 bg-card/95 p-4 shadow-2xl backdrop-blur-md z-[100]"
      >
        <FitAssessmentContent
          score={score}
          suitabilityReason={suitabilityReason}
        />
      </PopoverContent>
    </Popover>
  );
};
