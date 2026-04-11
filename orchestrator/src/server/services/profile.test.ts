import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearProfileCache, getProfile } from "./profile";

// Mock the dependencies
vi.mock("./design-resume", () => ({
  designResumeToProfile: vi.fn(),
  isLegacyDesignResumeError: vi.fn(),
}));

vi.mock("./rxresume", () => ({
  getResume: vi.fn(),
  RxResumeAuthConfigError: class RxResumeAuthConfigError extends Error {
    constructor() {
      super("Reactive Resume credentials not configured.");
      this.name = "RxResumeAuthConfigError";
    }
  },
}));

vi.mock("./rxresume/baseResumeId", () => ({
  getConfiguredRxResumeBaseResumeId: vi.fn(),
}));

import {
  designResumeToProfile,
  isLegacyDesignResumeError,
} from "./design-resume";
import { getResume, RxResumeAuthConfigError } from "./rxresume";
import { getConfiguredRxResumeBaseResumeId } from "./rxresume/baseResumeId";

describe("getProfile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearProfileCache();
    vi.mocked(designResumeToProfile).mockResolvedValue(null);
    vi.mocked(isLegacyDesignResumeError).mockReturnValue(false);
  });

  it("should throw an error if rxresumeBaseResumeId is not configured", async () => {
    vi.mocked(getConfiguredRxResumeBaseResumeId).mockResolvedValue({
      mode: "v5",
      resumeId: null,
    });

    await expect(getProfile()).rejects.toThrow(
      "Base resume not configured. Please select a base resume from your RxResume account in Settings.",
    );
  });

  it("should prefer the local Design Resume when available", async () => {
    const localProfile = { basics: { name: "Local User" } };
    vi.mocked(designResumeToProfile).mockResolvedValue(localProfile as any);

    const profile = await getProfile();

    expect(designResumeToProfile).toHaveBeenCalledTimes(1);
    expect(getConfiguredRxResumeBaseResumeId).not.toHaveBeenCalled();
    expect(getResume).not.toHaveBeenCalled();
    expect(profile).toEqual(localProfile);
  });

  it("should cache the local Design Resume profile", async () => {
    const localProfile = { basics: { name: "Local User" } };
    vi.mocked(designResumeToProfile).mockResolvedValue(localProfile as any);

    await getProfile();
    await getProfile();

    expect(designResumeToProfile).toHaveBeenCalledTimes(1);
    expect(getConfiguredRxResumeBaseResumeId).not.toHaveBeenCalled();
    expect(getResume).not.toHaveBeenCalled();
  });

  it("should fetch profile from Reactive Resume when configured", async () => {
    const mockResumeData = { basics: { name: "Test User" } };
    vi.mocked(getConfiguredRxResumeBaseResumeId).mockResolvedValue({
      mode: "v5",
      resumeId: "test-resume-id",
    });
    vi.mocked(getResume).mockResolvedValue({
      id: "test-resume-id",
      data: mockResumeData,
    } as any);

    const profile = await getProfile();

    expect(getConfiguredRxResumeBaseResumeId).toHaveBeenCalledTimes(1);
    expect(getResume).toHaveBeenCalledWith("test-resume-id");
    expect(profile).toEqual(mockResumeData);
  });

  it("should fall back to Reactive Resume when the local Design Resume is legacy", async () => {
    const mockResumeData = { basics: { name: "Fallback User" } };
    const legacyError = new Error("legacy design resume");
    vi.mocked(designResumeToProfile).mockRejectedValue(legacyError);
    vi.mocked(isLegacyDesignResumeError).mockReturnValue(true);
    vi.mocked(getConfiguredRxResumeBaseResumeId).mockResolvedValue({
      mode: "v5",
      resumeId: "test-resume-id",
    });
    vi.mocked(getResume).mockResolvedValue({
      id: "test-resume-id",
      data: mockResumeData,
    } as any);

    await expect(getProfile()).resolves.toEqual(mockResumeData);
    expect(getResume).toHaveBeenCalledWith("test-resume-id");
  });

  it("should cache the profile and not refetch on subsequent calls", async () => {
    const mockResumeData = { basics: { name: "Test User" } };
    vi.mocked(getConfiguredRxResumeBaseResumeId).mockResolvedValue({
      mode: "v5",
      resumeId: "test-resume-id",
    });
    vi.mocked(getResume).mockResolvedValue({
      id: "test-resume-id",
      data: mockResumeData,
    } as any);

    await getProfile();
    await getProfile();

    expect(designResumeToProfile).toHaveBeenCalledTimes(2);
    expect(getConfiguredRxResumeBaseResumeId).toHaveBeenCalledTimes(2);
    // But getResume should only be called once due to caching
    expect(getResume).toHaveBeenCalledTimes(1);
  });

  it("should refetch when forceRefresh is true", async () => {
    const mockResumeData = { basics: { name: "Test User" } };
    vi.mocked(getConfiguredRxResumeBaseResumeId).mockResolvedValue({
      mode: "v5",
      resumeId: "test-resume-id",
    });
    vi.mocked(getResume).mockResolvedValue({
      id: "test-resume-id",
      data: mockResumeData,
    } as any);

    await getProfile();
    await getProfile(true);

    expect(getResume).toHaveBeenCalledTimes(2);
    expect(vi.mocked(getResume).mock.calls[0]).toEqual(["test-resume-id"]);
    expect(vi.mocked(getResume).mock.calls[1]).toEqual([
      "test-resume-id",
      { forceRefresh: true },
    ]);
  });

  it("should throw user-friendly error on credential issues", async () => {
    vi.mocked(getConfiguredRxResumeBaseResumeId).mockResolvedValue({
      mode: "v5",
      resumeId: "test-resume-id",
    });
    vi.mocked(getResume).mockRejectedValue(
      new (RxResumeAuthConfigError as unknown as new () => Error)(),
    );

    await expect(getProfile()).rejects.toThrow(
      "Reactive Resume credentials not configured.",
    );
  });

  it("should throw error if resume data is empty", async () => {
    vi.mocked(getConfiguredRxResumeBaseResumeId).mockResolvedValue({
      mode: "v5",
      resumeId: "test-resume-id",
    });
    vi.mocked(getResume).mockResolvedValue({
      id: "test-resume-id",
      data: null,
    } as any);

    await expect(getProfile()).rejects.toThrow(
      "Resume data is empty or invalid",
    );
  });
});
