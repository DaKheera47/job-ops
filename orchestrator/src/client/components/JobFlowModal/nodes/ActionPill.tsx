import React from "react";

import { cn } from "@/lib/utils";

import type { NodeAction } from "../types";

interface ActionPillProps {
  action: NodeAction;
}

export const ActionPill: React.FC<ActionPillProps> = ({ action }) => {
  const Icon = action.icon;
  const className = cn(
    "nodrag nopan inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground/80 transition-colors hover:border-border hover:text-foreground",
    action.disabled && "pointer-events-none opacity-50",
  );

  const handleClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    action.onClick?.();
  };

  if (action.href) {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => event.stopPropagation()}
        className={className}
      >
        <Icon className="h-3 w-3" />
        {action.label}
      </a>
    );
  }

  return (
    <button type="button" onClick={handleClick} className={className} disabled={action.disabled}>
      <Icon className="h-3 w-3" />
      {action.label}
    </button>
  );
};
