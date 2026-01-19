import React from "react";
import { Handle, Position } from "@xyflow/react";
import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

import { hubStateTokens } from "../tokens";
import type { JobHubNodeData } from "../types";
import { ActionPill } from "./ActionPill";

interface JobHubNodeProps {
  data: JobHubNodeData;
  selected?: boolean;
}

export const JobHubNode: React.FC<JobHubNodeProps> = ({ data, selected }) => {
  const stateToken = hubStateTokens[data.state];
  const inPorts = [
    { id: "in-cv", label: "CV", top: 54 },
    { id: "in-cover", label: "Cover", top: 78 },
    { id: "in-meta", label: "Metadata", top: 102 },
  ];
  const outPorts = [
    { id: "out-notion", label: "Notion", top: 76 },
    { id: "out-outcome", label: "Outcome", top: 104 },
  ];

  return (
    <div
      className={cn(
        "relative w-[280px] rounded-lg border border-border/60 bg-muted/30 px-4 py-3 shadow-none",
        selected && "ring-2 ring-primary/40",
      )}
    >
      {inPorts.map((port) => (
        <React.Fragment key={port.id}>
          <Handle
            type="target"
            position={Position.Left}
            id={port.id}
            style={{ top: port.top }}
            className="h-2 w-2 border border-background bg-muted-foreground/60"
            isConnectable={false}
          />
          <span
            className="pointer-events-none absolute -left-16 text-[9px] text-muted-foreground/70"
            style={{ top: port.top - 6 }}
          >
            {port.label}
          </span>
        </React.Fragment>
      ))}

      {outPorts.map((port) => (
        <React.Fragment key={port.id}>
          <Handle
            type="source"
            position={Position.Right}
            id={port.id}
            style={{ top: port.top }}
            className="h-2 w-2 border border-background bg-muted-foreground/60"
            isConnectable={false}
          />
          <span
            className="pointer-events-none absolute -right-16 text-[9px] text-muted-foreground/70 text-right"
            style={{ top: port.top - 6 }}
          >
            {port.label}
          </span>
        </React.Fragment>
      ))}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{data.title}</div>
          <div className="text-xs text-muted-foreground">{data.company}</div>
        </div>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wide",
            stateToken.badge,
          )}
        >
          {stateToken.label}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {data.chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-border/50 bg-muted/20 px-2 py-0.5 text-[10px] text-muted-foreground/80"
          >
            {chip}
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground/70">
        <div className="flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-muted-foreground/60" />
          <span className="font-medium text-foreground/80">{data.scoreLabel}</span>
        </div>
      </div>

      {data.actions && data.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.actions.map((action) => (
            <ActionPill key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
  );
};
