import type {
  ResumeProjectCatalogItem,
  ResumeProjectsSettings,
} from "@shared/types.js";
import { describe, expect, it } from "vitest";
import { getNoSelectedProjectsInfo } from "./TailoringSections";

const project = (id: string): ResumeProjectCatalogItem => ({
  id,
  name: id,
  description: "",
  date: "",
  isVisibleInBase: true,
});

const settings = (
  overrides: Partial<ResumeProjectsSettings> = {},
): ResumeProjectsSettings => ({
  maxProjects: 3,
  lockedProjectIds: [],
  aiSelectableProjectIds: ["p1", "p2"],
  ...overrides,
});

describe("getNoSelectedProjectsInfo", () => {
  const catalog = [project("p1"), project("p2")];

  it("returns null when projects are selected", () => {
    expect(
      getNoSelectedProjectsInfo({
        catalog,
        isCatalogLoading: false,
        selectedIds: new Set(["p1"]),
        resumeProjectsSettings: settings(),
      }),
    ).toBeNull();
  });

  it("explains when no resume projects exist", () => {
    expect(
      getNoSelectedProjectsInfo({
        catalog: [],
        isCatalogLoading: false,
        selectedIds: new Set(),
        resumeProjectsSettings: settings(),
      })?.reason,
    ).toBe("no-projects");
  });

  it("explains when settings allow no project slots", () => {
    expect(
      getNoSelectedProjectsInfo({
        catalog,
        isCatalogLoading: false,
        selectedIds: new Set(),
        resumeProjectsSettings: settings({ maxProjects: 0 }),
      })?.reason,
    ).toBe("no-project-slots");
  });

  it("explains when must-include projects fill all automatic slots", () => {
    expect(
      getNoSelectedProjectsInfo({
        catalog,
        isCatalogLoading: false,
        selectedIds: new Set(),
        resumeProjectsSettings: settings({
          maxProjects: 2,
          lockedProjectIds: ["p1", "p2"],
          aiSelectableProjectIds: [],
        }),
      })?.reason,
    ).toBe("no-available-slots");
  });

  it("explains when no projects are AI-selectable", () => {
    expect(
      getNoSelectedProjectsInfo({
        catalog,
        isCatalogLoading: false,
        selectedIds: new Set(),
        resumeProjectsSettings: settings({ aiSelectableProjectIds: [] }),
      })?.reason,
    ).toBe("no-ai-selectable-projects");
  });

  it("explains when automatic selection produced no saved selection", () => {
    expect(
      getNoSelectedProjectsInfo({
        catalog,
        isCatalogLoading: false,
        selectedIds: new Set(),
        resumeProjectsSettings: settings({ aiSelectableProjectIds: ["p1"] }),
      })?.reason,
    ).toBe("selection-empty");
  });
});
