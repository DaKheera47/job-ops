import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { _resetSettingsCache, useSettings } from "./useSettings";

vi.mock("../api", () => ({
  getSettings: vi.fn(),
}));

describe("useSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetSettingsCache();
  });

  it("fetches settings on mount if not already cached", async () => {
    const mockSettings = { showSponsorInfo: false };
    vi.mocked(api.getSettings).mockResolvedValue(mockSettings as any);

    const { result } = renderHook(() => useSettings());

    // Should start in loading state
    expect(result.current.settings).toBeNull();

    await waitFor(() => {
      expect(result.current.settings).toEqual(mockSettings);
    });

    expect(result.current.showSponsorInfo).toBe(false);
    expect(api.getSettings).toHaveBeenCalledTimes(1);
  });

  it("uses default values when settings are null", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(null as any);

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      // settings is null, so showSponsorInfo should default to true
      expect(result.current.showSponsorInfo).toBe(true);
    });
  });

  it("provides a refresh function that updates settings", async () => {
    const initialSettings = { showSponsorInfo: true };
    const updatedSettings = { showSponsorInfo: false };

    vi.mocked(api.getSettings).mockResolvedValueOnce(initialSettings as any);
    vi.mocked(api.getSettings).mockResolvedValueOnce(updatedSettings as any);

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.settings).toEqual(initialSettings);
    });

    let refreshed: any;
    await waitFor(async () => {
      refreshed = await result.current.refreshSettings();
    });

    expect(refreshed).toEqual(updatedSettings);
    expect(result.current.settings).toEqual(updatedSettings);
    expect(result.current.showSponsorInfo).toBe(false);
  });

  it("handles errors when fetching settings", async () => {
    const mockError = new Error("Failed to fetch");
    vi.mocked(api.getSettings).mockRejectedValue(mockError);

    const { result } = renderHook(() => useSettings());

    await waitFor(() => {
      expect(result.current.error).toEqual(mockError);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.settings).toBeNull();
  });
});
