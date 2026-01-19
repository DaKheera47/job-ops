import React from "react";
import { Handle, Position } from "@xyflow/react";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

import { nodeStatusTokens } from "../tokens";
import type { JobPluginNodeData } from "../types";
import { ActionPill } from "./ActionPill";

interface JobPluginNodeProps {
  data: JobPluginNodeData;
  selected?: boolean;
}

export const JobPluginNode: React.FC<JobPluginNodeProps> = ({ data, selected }) => {
  const statusToken = nodeStatusTokens[data.status];
  const Icon = data.icon;
  const showInput = Boolean(data.inputHandle);
  const showOutput = Boolean(data.outputHandle);

  return (
    <div
      className={cn(
        "w-[280px] rounded-lg border border-border/60 bg-muted/30 px-3 py-2 shadow-none",
        selected && "ring-2 ring-primary/40",
      )}
    >
      {showInput && (
        <Handle
          type="target"
          id="in"
          position={Position.Left}
          style={{ top: "50%" }}
          className="h-2 w-2 border border-background bg-muted-foreground/60"
          isConnectable={false}
        />
      )}
      {showOutput && (
        <Handle
          type="source"
          id="out"
          position={Position.Right}
          style={{ top: "50%" }}
          className="h-2 w-2 border border-background bg-muted-foreground/60"
          isConnectable={false}
        />
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", statusToken.dot)} />
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />}
          <div>
            <div className="text-xs font-semibold">{data.title}</div>
            {data.subtitle && <div className="text-[10px] text-muted-foreground/70">{data.subtitle}</div>}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
      </div>

      <div className="mt-1 text-[10px] text-muted-foreground/70">Updated {data.updatedAt}</div>

      {data.actions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.actions.map((action) => (
            <ActionPill key={action.id} action={action} />
          ))}
        </div>
      )}
    </div>
  );
};
