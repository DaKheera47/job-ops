import * as api from "@client/api";
import { renderHookWithQueryClient } from "@client/test/renderWithQueryClient";
import type { PipelineSearchPreset } from "@shared/types";
import { act, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePipelineSearchPresets } from "./usePipelineSearchPresets";

vi.mock("@client/api", () => ({
  getPipelineSearchPresets: vi.fn(),
  createPipelineSearchPreset: vi.fn(),
  updatePipelineSearchPreset: vi.fn(),
  deletePipelineSearchPreset: vi.fn(),
  markPipelineSearchPresetUsed: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
  },
}));

const savedSearch: PipelineSearchPreset = {
  id: "preset-1",
  name: "London backend",
  config: {
    searchTerms: ["backend"],
    sources: ["linkedin"],
    country: "united kingdom",
    cityLocations: [],
    workplaceTypes: ["remote"],
    searchScope: "selected_only",
    matchStrictness: "exact_only",
    topN: 10,
    minSuitabilityScore: 50,
    runBudget: 100,
    automaticPresetId: "custom",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: null,
};

describe("usePipelineSearchPresets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getPipelineSearchPresets).mockResolvedValue({
      searches: [savedSearch],
    });
    vi.mocked(api.createPipelineSearchPreset).mockResolvedValue(savedSearch);
    vi.mocked(api.updatePipelineSearchPreset).mockResolvedValue(savedSearch);
    vi.mocked(api.deletePipelineSearchPreset).mockResolvedValue({
      deleted: true,
    });
    vi.mocked(api.markPipelineSearchPresetUsed).mockResolvedValue({
      ok: true,
    } as never);
  });

  it("loads saved searches only when enabled", async () => {
    renderHookWithQueryClient(() =>
      usePipelineSearchPresets({ enabled: false }),
    );

    expect(api.getPipelineSearchPresets).not.toHaveBeenCalled();

    const { result } = renderHookWithQueryClient(() =>
      usePipelineSearchPresets({ enabled: true }),
    );

    await waitFor(() => {
      expect(result.current.savedSearches).toEqual([savedSearch]);
    });
    expect(api.getPipelineSearchPresets).toHaveBeenCalledTimes(1);
  });

  it("delegates saved search mutations", async () => {
    const { result } = renderHookWithQueryClient(() =>
      usePipelineSearchPresets({ enabled: true }),
    );

    await act(async () => {
      await result.current.onCreateSavedSearch({
        name: savedSearch.name,
        config: savedSearch.config,
      });
      await result.current.onUpdateSavedSearch(savedSearch.id, {
        name: savedSearch.name,
        config: savedSearch.config,
      });
      await result.current.onDeleteSavedSearch(savedSearch.id);
      await result.current.onApplySavedSearch(savedSearch);
    });

    expect(
      vi.mocked(api.createPipelineSearchPreset).mock.calls[0]?.[0],
    ).toEqual({
      name: savedSearch.name,
      config: savedSearch.config,
    });
    expect(vi.mocked(api.updatePipelineSearchPreset).mock.calls[0]?.[0]).toBe(
      savedSearch.id,
    );
    expect(
      vi.mocked(api.updatePipelineSearchPreset).mock.calls[0]?.[1],
    ).toEqual({
      name: savedSearch.name,
      config: savedSearch.config,
    });
    expect(vi.mocked(api.deletePipelineSearchPreset).mock.calls[0]?.[0]).toBe(
      savedSearch.id,
    );
    expect(vi.mocked(api.markPipelineSearchPresetUsed).mock.calls[0]?.[0]).toBe(
      savedSearch.id,
    );
    expect(toast.success).toHaveBeenCalledWith("Saved search created");
    expect(toast.success).toHaveBeenCalledWith("Saved search updated");
    expect(toast.success).toHaveBeenCalledWith("Saved search deleted");
  });
});
