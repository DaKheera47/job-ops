import type { Job } from "@shared/types.js";
import type React from "react";
import { cn } from "@/lib/utils";

interface FitAssessmentProps {
  job: Job;
  className?: string;
}

export const FitAssessment: React.FC<FitAssessmentProps> = ({
  job,
  className,
}) => {
  if (!job.suitabilityReason) return null;

  return (
    <div className={cn("space-y-3", className)}>
      <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          AI Reasoning for{"  "}
          {job.suitabilityScore != null && `${job.suitabilityScore}/100`}
        </div>
        <p className="text-base text-foreground/90 mt-1">
          {job.suitabilityReason}
        </p>
      </div>
    </div>
  );
};
