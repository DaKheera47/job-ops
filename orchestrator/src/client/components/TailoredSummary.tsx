import type React from "react";
import { cn } from "@/lib/utils";
import type { Job } from "../../shared/types";

interface TailoredSummaryProps {
  job: Job;
  className?: string;
}

export const TailoredSummary: React.FC<TailoredSummaryProps> = ({
  job,
  className,
}) => {
  if (!job.tailoredSummary) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border/40 bg-muted/10 px-3 py-2.5",
        className,
      )}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
        Tailored Summary
      </div>
      <p className="text-xs text-foreground/80 leading-relaxed italic whitespace-pre-wrap">
        "{job.tailoredSummary}"
      </p>
    </div>
  );
};
