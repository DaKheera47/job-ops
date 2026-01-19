import type { Node } from "@xyflow/react";

import type { FlowNodeData } from "./types";

export type NodePosition = { x: number; y: number };
export type NodePositionMap = Record<string, NodePosition>;

const storageKey = (jobId: string) => `jobflow.positions.${jobId}`;

export const readPositions = (jobId: string | null) => {
  if (!jobId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey(jobId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, { x?: number; y?: number }>;
    if (!parsed || typeof parsed !== "object") return null;
    const next: NodePositionMap = {};
    Object.entries(parsed).forEach(([id, value]) => {
      if (!value || typeof value !== "object") return;
      if (typeof value.x === "number" && typeof value.y === "number") {
        next[id] = { x: value.x, y: value.y };
      }
    });
    return Object.keys(next).length > 0 ? next : null;
  } catch {
    return null;
  }
};

export const writePositions = (jobId: string | null, positions: NodePositionMap) => {
  if (!jobId || typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(jobId), JSON.stringify(positions));
  } catch {
    // Ignore storage errors
  }
};

export const clearPositions = (jobId: string | null) => {
  if (!jobId || typeof window === "undefined") return;
  try {
    localStorage.removeItem(storageKey(jobId));
  } catch {
    // Ignore storage errors
  }
};

export const mergePositions = (
  flowNodes: Array<Node<FlowNodeData>>,
  previousNodes: Array<Node<FlowNodeData>>,
  storedPositions: NodePositionMap | null,
  resetToDefaults: boolean
) => {
  const positions = storedPositions ?? {};
  const prevById = new Map(previousNodes.map((node) => [node.id, node]));
  return flowNodes.map((node) => {
    const override = positions[node.id];
    if (override) return { ...node, position: override };
    if (!resetToDefaults) {
      const previous = prevById.get(node.id);
      if (previous) return { ...node, position: previous.position };
    }
    return node;
  });
};
