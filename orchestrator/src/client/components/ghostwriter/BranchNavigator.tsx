import type { BranchInfo } from "@shared/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";

type BranchNavigatorProps = {
  branchInfo: BranchInfo;
  onSwitch: (messageId: string) => void;
};

export const BranchNavigator: React.FC<BranchNavigatorProps> = ({
  branchInfo,
  onSwitch,
}) => {
  const { siblingIds, activeIndex } = branchInfo;
  const total = siblingIds.length;
  const canGoLeft = activeIndex > 0;
  const canGoRight = activeIndex < total - 1;

  return (
    <div className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
      <button
        type="button"
        disabled={!canGoLeft}
        onClick={() => canGoLeft && onSwitch(siblingIds[activeIndex - 1])}
        className="rounded p-0.5 hover:bg-muted/60 disabled:opacity-30 disabled:cursor-default"
        aria-label="Previous variant"
      >
        <ChevronLeft className="h-3 w-3" />
      </button>
      <span className="tabular-nums">
        {activeIndex + 1}/{total}
      </span>
      <button
        type="button"
        disabled={!canGoRight}
        onClick={() => canGoRight && onSwitch(siblingIds[activeIndex + 1])}
        className="rounded p-0.5 hover:bg-muted/60 disabled:opacity-30 disabled:cursor-default"
        aria-label="Next variant"
      >
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
};
