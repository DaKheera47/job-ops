import type { ResumeProjectsSettings } from "@shared/types.js";
import { describe, expect, it } from "vitest";
import { toggleAiSelectable, toggleMustInclude } from "./resume-projects-state";

const baseSettings: ResumeProjectsSettings = {
  maxProjects: 2,
  lockedProjectIds: [],
  aiSelectableProjectIds: ["p1", "p2"],
};

describe("resume-projects-state", () => {
  it("removes project from aiSelectable when must-include is enabled", () => {
    const next = toggleMustInclude({
      settings: baseSettings,
      projectId: "p1",
      checked: true,
      maxProjectsTotal: 3,
    });

    expect(next.lockedProjectIds).toEqual(["p1"]);
    expect(next.aiSelectableProjectIds).toEqual(["p2"]);
  });

  it("does not auto-add project to aiSelectable when must-include is disabled", () => {
    const start: ResumeProjectsSettings = {
      maxProjects: 2,
      lockedProjectIds: ["p1"],
      aiSelectableProjectIds: [],
    };

    const next = toggleMustInclude({
      settings: start,
      projectId: "p1",
      checked: false,
      maxProjectsTotal: 3,
    });

    expect(next.lockedProjectIds).toEqual([]);
    expect(next.aiSelectableProjectIds).toEqual([]);
  });

  it("toggles aiSelectable explicitly", () => {
    const add = toggleAiSelectable({
      settings: { ...baseSettings, aiSelectableProjectIds: ["p2"] },
      projectId: "p1",
      checked: true,
    });
    expect(add.aiSelectableProjectIds).toEqual(["p2", "p1"]);

    const remove = toggleAiSelectable({
      settings: add,
      projectId: "p2",
      checked: false,
    });
    expect(remove.aiSelectableProjectIds).toEqual(["p1"]);
  });
});
