import React from "react";

import type { StageHeaderNodeData } from "../types";

interface StageHeaderNodeProps {
  data: StageHeaderNodeData;
}

export const StageHeaderNode: React.FC<StageHeaderNodeProps> = ({ data }) => (
  <div className="w-[280px] rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
    {data.label}
  </div>
);
