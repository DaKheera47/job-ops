import { describe, expect, it, beforeEach } from "vitest";
import type { Node } from "@xyflow/react";

import { clearPositions, mergePositions, readPositions, writePositions } from "../positions";
import type { FlowNodeData } from "../types";

const makeNode = (id: string, x: number, y: number): Node<FlowNodeData> => ({
  id,
  type: "jobPlugin",
  position: { x, y },
  data: {
    kind: "plugin",
    title: "Node",
    status: "ready",
    updatedAt: "Now",
    actions: [],
    inspector: {
      title: "Node",
      status: "ready",
      meta: [],
      logs: [],
      raw: {},
    },
  },
});

describe("JobFlowModal positions", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes and reads positions", () => {
    writePositions("job-1", { a: { x: 10, y: 20 } });
    expect(readPositions("job-1")).toEqual({ a: { x: 10, y: 20 } });
  });

  it("clears stored positions", () => {
    writePositions("job-1", { a: { x: 10, y: 20 } });
    clearPositions("job-1");
    expect(readPositions("job-1")).toBeNull();
  });

  it("merges stored positions over defaults", () => {
    const flowNodes = [makeNode("a", 0, 0), makeNode("b", 1, 1)];
    const prevNodes: Array<Node<FlowNodeData>> = [];
    const merged = mergePositions(flowNodes, prevNodes, { a: { x: 99, y: 88 } }, false);
    expect(merged[0].position).toEqual({ x: 99, y: 88 });
    expect(merged[1].position).toEqual({ x: 1, y: 1 });
  });

  it("keeps previous positions when no stored data", () => {
    const flowNodes = [makeNode("a", 0, 0)];
    const prevNodes = [makeNode("a", 50, 50)];
    const merged = mergePositions(flowNodes, prevNodes, null, false);
    expect(merged[0].position).toEqual({ x: 50, y: 50 });
  });

  it("resets to defaults when reset flag set", () => {
    const flowNodes = [makeNode("a", 0, 0)];
    const prevNodes = [makeNode("a", 50, 50)];
    const merged = mergePositions(flowNodes, prevNodes, null, true);
    expect(merged[0].position).toEqual({ x: 0, y: 0 });
  });
});
