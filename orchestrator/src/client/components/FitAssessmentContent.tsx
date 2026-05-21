import { Glasses } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

interface FitAssessmentContentProps {
  score: number | null;
  suitabilityReason: string;
  className?: string;
}

export const FitAssessmentContent: React.FC<FitAssessmentContentProps> = ({
  score,
  suitabilityReason,
  className,
}) => {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <div className="flex items-center gap-2">
          <Glasses className="h-4 w-4 text-emerald-400 animate-pulse" />
          <span className="font-semibold text-sm text-foreground">
            Fit Assessment
          </span>
        </div>
        {score !== null && (
          <span
            className={cn(
              "text-xs font-semibold px-2 py-0.5 rounded-full border",
              score >= 70
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : score >= 60
                  ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  : "bg-slate-500/10 text-slate-400 border-slate-500/20",
            )}
          >
            {score}/100
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
        {suitabilityReason}
      </p>
    </div>
  );
};
