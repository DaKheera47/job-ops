import type { Job } from "@shared/types";

import type { HubState, NodeStatus } from "./types";

export const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "Not yet";
  try {
    const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    const date = parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });
    const time = parsed.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${date} ${time}`;
  } catch {
    return dateStr;
  }
};

export const stripHtml = (value: string) => value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export const resolveHubState = (job: Job): HubState => {
  if (job.status === "skipped" || job.status === "expired") return "closed";
  if (job.status === "applied") return "applied";
  if (job.status === "ready") return job.applicationLink ? "applying" : "prepared";
  if (job.status === "processing") return "prepared";
  if (job.status === "discovered") {
    if (job.suitabilityScore != null && job.suitabilityScore >= 70) return "qualified";
    return "discovered";
  }
  return "discovered";
};

export const getEdgeStroke = (status: NodeStatus) => {
  switch (status) {
    case "ready":
      return "#34d399";
    case "in-progress":
      return "#38bdf8";
    case "failed":
      return "#fb7185";
    case "missing":
    default:
      return "#64748b";
  }
};
