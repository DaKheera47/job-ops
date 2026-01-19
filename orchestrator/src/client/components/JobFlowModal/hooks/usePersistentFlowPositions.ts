import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Node } from "@xyflow/react";

import type { FlowNodeData } from "../types";
import { clearPositions, mergePositions, readPositions, writePositions } from "../positions";

interface PersistentFlowPositionsOptions {
  jobId: string | null;
}

export const usePersistentFlowPositions = ({ jobId }: PersistentFlowPositionsOptions) => {
  const initialPositions = useMemo(() => readPositions(jobId) ?? {}, [jobId]);
  const positionsRef = useRef<Record<string, { x: number; y: number }>>(initialPositions);
  const resetRef = useRef(false);

  useEffect(() => {
    positionsRef.current = initialPositions;
    resetRef.current = false;
  }, [initialPositions]);

  const applyPositions = useCallback(
    (flowNodes: Array<Node<FlowNodeData>>, previousNodes: Array<Node<FlowNodeData>>) => {
      const merged = mergePositions(flowNodes, previousNodes, positionsRef.current, resetRef.current);
      resetRef.current = false;
      return merged;
    },
    [],
  );

  const persistPositions = useCallback(
    (nodes: Array<Node<FlowNodeData>>) => {
      if (!jobId) return;
      const next: Record<string, { x: number; y: number }> = {};
      nodes.forEach((node) => {
        next[node.id] = node.position;
      });
      positionsRef.current = next;
      writePositions(jobId, next);
    },
    [jobId],
  );

  const resetPositions = useCallback(() => {
    if (!jobId) return;
    clearPositions(jobId);
    positionsRef.current = {};
    resetRef.current = true;
  }, [jobId]);

  return {
    applyPositions,
    persistPositions,
    resetPositions,
  };
};
