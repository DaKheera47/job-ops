import { describe, expect, it, vi } from "vitest";

vi.mock("@client/lib/jobCopy", () => ({
  copyTextToClipboard: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    message: vi.fn(),
    error: vi.fn(),
  },
}));

import { buildFlow } from "../buildFlow";
import { createJob } from "./fixtures";

describe("buildFlow", () => {
  it("builds core nodes and edges", () => {
    const job = createJob();
    const flow = buildFlow(job, vi.fn(), {});

    const nodeIds = flow.nodes.map((node) => node.id);
    expect(nodeIds).toEqual(
      expect.arrayContaining([
        "header-inputs",
        "header-generate",
        "header-apply",
        "header-outcomes",
        "source",
        "description",
        "metadata",
        "cv",
        "cover",
        "hub",
        "notion",
        "oa",
      ]),
    );

    const edgeIds = flow.edges.map((edge) => edge.id);
    expect(edgeIds).toEqual(
      expect.arrayContaining([
        "e-source-cv",
        "e-description-cover",
        "e-metadata-hub",
        "e-cv-hub",
        "e-cover-hub",
        "e-hub-notion",
        "e-hub-oa",
      ]),
    );
  });

  it("marks header nodes as non-draggable", () => {
    const job = createJob();
    const flow = buildFlow(job, vi.fn(), {});
    const header = flow.nodes.find((node) => node.id === "header-inputs");
    expect(header?.draggable).toBe(false);
  });
});
