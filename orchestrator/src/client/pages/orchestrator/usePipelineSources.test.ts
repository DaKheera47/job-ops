import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { PIPELINE_SOURCES_STORAGE_KEY } from "./constants";
import { usePipelineSources } from "./usePipelineSources";

describe("usePipelineSources", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("filters stored sources to allowed sources and initializes with enabled sources", () => {
    localStorage.setItem(
      PIPELINE_SOURCES_STORAGE_KEY,
      JSON.stringify(["gradcracker", "ukvisajobs"]),
    );

    const allowedSources = ["gradcracker", "ukvisajobs"] as const;
    const enabledSources = ["gradcracker"] as const;

    const { result } = renderHook(() =>
      usePipelineSources(allowedSources, enabledSources),
    );

    // Should keep both stored sources since they're allowed
    expect(result.current.pipelineSources).toEqual([
      "gradcracker",
      "ukvisajobs",
    ]);
  });

  it("falls back to enabled sources when no valid stored sources", () => {
    localStorage.setItem(
      PIPELINE_SOURCES_STORAGE_KEY,
      JSON.stringify(["ukvisajobs"]),
    );

    const allowedSources = ["gradcracker", "linkedin"] as const;
    const enabledSources = ["gradcracker", "linkedin"] as const;

    const { result } = renderHook(() =>
      usePipelineSources(allowedSources, enabledSources),
    );

    // Should use enabled sources when stored sources are not in allowed list
    expect(result.current.pipelineSources).toEqual(["gradcracker", "linkedin"]);
  });

  it("ignores toggles for sources not in allowed list", () => {
    localStorage.setItem(
      PIPELINE_SOURCES_STORAGE_KEY,
      JSON.stringify(["gradcracker"]),
    );

    const allowedSources = ["gradcracker"] as const;
    const enabledSources = ["gradcracker"] as const;

    const { result } = renderHook(() =>
      usePipelineSources(allowedSources, enabledSources),
    );

    act(() => {
      result.current.toggleSource("ukvisajobs", true);
    });

    expect(result.current.pipelineSources).toEqual(["gradcracker"]);
  });
});
