import { Sparkles } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import type { Job } from "../../shared/types";

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
        <div className="text-[11px] font-medium uppercase tracking-wide text-primary/70 mb-1.5 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3" />
          Fit Assessment
        </div>
        <p className="text-xs text-foreground/90 leading-relaxed font-medium">
          {job.suitabilityReason}
        </p>
      </div>
    </div>
  );
};
