/**
 * Suitability score display component.
 */

import type React from "react";

import { Progress } from "@/components/ui/progress";

interface ScoreIndicatorProps {
  score: number | null;
}

export const ScoreIndicator: React.FC<ScoreIndicatorProps> = ({ score }) => {
  if (score === null) {
    return <span className="text-sm text-muted-foreground">Not scored</span>;
  }

  return (
    <div className="flex items-center gap-2">
      <Progress value={score} className="h-2 w-20" />
      <span className="text-sm tabular-nums text-muted-foreground">
        {score}
      </span>
    </div>
  );
};
