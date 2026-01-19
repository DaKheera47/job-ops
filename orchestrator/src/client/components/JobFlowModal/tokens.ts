import type { Job } from "@shared/types";

import type { HubState, NodeStatus } from "./types";

export const sourceLabel: Record<Job["source"], string> = {
  gradcracker: "Gradcracker",
  indeed: "Indeed",
  linkedin: "LinkedIn",
  ukvisajobs: "UK Visa Jobs",
};

export const nodeStatusTokens: Record<NodeStatus, { label: string; dot: string; text: string }> = {
  missing: {
    label: "Missing",
    dot: "bg-muted-foreground/40",
    text: "text-muted-foreground/70",
  },
  "in-progress": {
    label: "In progress",
    dot: "bg-sky-400",
    text: "text-sky-400",
  },
  ready: {
    label: "Ready",
    dot: "bg-emerald-400",
    text: "text-emerald-400",
  },
  failed: {
    label: "Failed",
    dot: "bg-rose-400",
    text: "text-rose-400",
  },
};

export const hubStateTokens: Record<HubState, { label: string; badge: string }> = {
  discovered: {
    label: "Discovered",
    badge: "border-sky-500/30 bg-sky-500/10 text-sky-200",
  },
  qualified: {
    label: "Qualified",
    badge: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  },
  prepared: {
    label: "Prepared",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  applying: {
    label: "Applying",
    badge: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  },
  applied: {
    label: "Applied",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  },
  "in-progress": {
    label: "In progress",
    badge: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200",
  },
  closed: {
    label: "Closed",
    badge: "border-muted-foreground/20 bg-muted/20 text-muted-foreground",
  },
};
