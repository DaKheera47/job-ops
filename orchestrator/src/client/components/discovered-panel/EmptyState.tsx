import { Sparkles } from "lucide-react";
import type React from "react";

export const EmptyState: React.FC = () => {
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-center px-4">
      <div className="h-10 w-10 rounded-full border border-border/40 bg-muted/20 flex items-center justify-center">
        <Sparkles className="h-4 w-4 text-muted-foreground/50" />
      </div>
      <div className="text-sm font-medium text-muted-foreground">
        No job selected
      </div>
      <p className="text-xs text-muted-foreground/70 max-w-[200px]">
        Select a job from the list to see details and decide whether to tailor.
      </p>
    </div>
  );
};
