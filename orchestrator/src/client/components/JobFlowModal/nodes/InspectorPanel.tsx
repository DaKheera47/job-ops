import React from "react";

import { cn } from "@/lib/utils";

import { nodeStatusTokens } from "../tokens";
import type { InspectorData } from "../types";

interface InspectorPanelProps {
  data?: InspectorData;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ data }) => {
  if (!data) {
    return (
      <div className="text-xs text-muted-foreground/70">
        Select a node to inspect raw JSON, metadata, and logs.
      </div>
    );
  }

  const statusToken = nodeStatusTokens[data.status];
  const rawJson = JSON.stringify(data.raw, null, 2);

  return (
    <div className="space-y-4 text-xs">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", statusToken.dot)} />
          <div className="text-sm font-semibold text-foreground">{data.title}</div>
        </div>
        {data.subtitle && <div className="text-[11px] text-muted-foreground">{data.subtitle}</div>}
        {data.summary && <div className="text-[11px] text-muted-foreground/80">{data.summary}</div>}
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Metadata</div>
        <div className="mt-2 space-y-1">
          {data.meta.length === 0 && (
            <div className="text-[11px] text-muted-foreground/70">No metadata captured.</div>
          )}
          {data.meta.map((item) => (
            <div key={item.label} className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-muted-foreground/70">{item.label}</div>
              <div className="text-[11px] font-mono tabular-nums text-foreground/80">
                {item.value || "-"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Raw JSON</div>
        <pre className="mt-2 max-h-40 overflow-auto rounded border border-border/50 bg-muted/20 p-2 text-[10px] leading-relaxed text-muted-foreground font-mono">
{rawJson}
        </pre>
      </div>

      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Logs</div>
        <div className="mt-2 space-y-1 text-[11px] text-muted-foreground/80">
          {data.logs.length === 0 && <div>No log entries yet.</div>}
          {data.logs.map((log, index) => (
            <div key={`${log}-${index}`}>{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};
