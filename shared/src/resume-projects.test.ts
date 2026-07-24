import { describe, expect, it } from "vitest";
import { resolveResumeProjectSelection } from "./resume-projects";
import type { ResumeProjectCatalogItem } from "./types";

const catalog = (ids: string[]): ResumeProjectCatalogItem[] =>
  ids.map((id) => ({
    id,
    name: id,
    description: "",
    date: "",
    isVisibleInBase: false,
  }));

describe("resolveResumeProjectSelection", () => {
  it.each([
    {
      name: "drops stale, duplicate, and excluded job IDs",
      catalogIds: ["must", "excluded", "ai-1", "ai-2"],
      settings: {
        maxProjects: 3,
        lockedProjectIds: ["must", "must", "deleted"],
        aiSelectableProjectIds: ["ai-1", "ai-2", "must", "deleted"],
      },
      selected: "excluded,ai-2,ai-2,deleted",
      effective: ["must", "ai-2"],
      excluded: ["excluded"],
      target: 3,
      remaining: 1,
    },
    {
      name: "raises a low target to the must-include count",
      catalogIds: ["a", "b", "c", "d"],
      settings: {
        maxProjects: 1,
        lockedProjectIds: ["a", "b", "c"],
        aiSelectableProjectIds: ["d"],
      },
      selected: "d",
      effective: ["a", "b", "c"],
      excluded: [],
      target: 3,
      remaining: 0,
    },
    {
      name: "keeps fewer projects when the catalog is insufficient",
      catalogIds: ["a", "b", "c"],
      settings: {
        maxProjects: 5,
        lockedProjectIds: [],
        aiSelectableProjectIds: ["a", "b", "c"],
      },
      selected: "a,b,c",
      effective: ["a", "b", "c"],
      excluded: [],
      target: 5,
      remaining: 2,
    },
    {
      name: "caps a job selection at the target",
      catalogIds: ["a", "b", "c", "d", "e"],
      settings: {
        maxProjects: 3,
        lockedProjectIds: ["a"],
        aiSelectableProjectIds: ["b", "c", "d", "e"],
      },
      selected: "b,c,d,e",
      effective: ["a", "b", "c"],
      excluded: [],
      target: 3,
      remaining: 0,
    },
  ])("$name", ({
    catalogIds,
    settings,
    selected,
    effective,
    excluded,
    target,
    remaining,
  }) => {
    expect(
      resolveResumeProjectSelection({
        catalog: catalog(catalogIds),
        resumeProjects: settings,
        selectedProjectIds: selected,
      }),
    ).toMatchObject({
      effectiveSelectedIds: effective,
      excludedIds: excluded,
      targetCount: target,
      remainingSlots: remaining,
    });
  });
});
