import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearProfileCache, getProfile } from "./profile";

// Mock the dependencies
vi.mock("../repositories/settings", () => ({
  getSetting: vi.fn(),
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

import { getSetting } from "../repositories/settings";
import { getResume, RxResumeAuthConfigError } from "./rxresume";

describe("getProfile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearProfileCache();
  });

  it("should throw an error if rxresumeBaseResumeId is not configured", async () => {
    vi.mocked(getSetting).mockResolvedValue(null);

    await expect(getProfile()).rejects.toThrow(
      "Base resume not configured. Please select a base resume from your RxResume account in Settings.",
    );
  });

  it("should fetch profile from Reactive Resume when configured", async () => {
    const mockResumeData = { basics: { name: "Test User" } };
    vi.mocked(getSetting).mockResolvedValue("test-resume-id");
    vi.mocked(getResume).mockResolvedValue({
      id: "test-resume-id",
      data: mockResumeData,
    } as any);

    const profile = await getProfile();

    expect(getSetting).toHaveBeenCalledWith("rxresumeMode");
    expect(getSetting).toHaveBeenCalledWith("rxresumeBaseResumeId");
    expect(getResume).toHaveBeenCalledWith("test-resume-id");
    expect(profile).toEqual(mockResumeData);
  });

  it("should cache the profile and not refetch on subsequent calls", async () => {
    const mockResumeData = { basics: { name: "Test User" } };
    vi.mocked(getSetting).mockResolvedValue("test-resume-id");
    vi.mocked(getResume).mockResolvedValue({
      id: "test-resume-id",
      data: mockResumeData,
    } as any);

    await getProfile();
    await getProfile();

    // The helper reads mode + legacy/per-mode resume-id settings each call.
    expect(getSetting).toHaveBeenCalledTimes(8);
    // But getResume should only be called once due to caching
    expect(getResume).toHaveBeenCalledTimes(1);
  });

  it("should refetch when forceRefresh is true", async () => {
    const mockResumeData = { basics: { name: "Test User" } };
    vi.mocked(getSetting).mockResolvedValue("test-resume-id");
    vi.mocked(getResume).mockResolvedValue({
      id: "test-resume-id",
      data: mockResumeData,
    } as any);

    await getProfile();
    await getProfile(true);

    expect(getResume).toHaveBeenCalledTimes(2);
  });

  it("should throw user-friendly error on credential issues", async () => {
    vi.mocked(getSetting).mockResolvedValue("test-resume-id");
    vi.mocked(getResume).mockRejectedValue(
      new (RxResumeAuthConfigError as unknown as new () => Error)(),
    );

    await expect(getProfile()).rejects.toThrow(
      "Reactive Resume credentials not configured.",
    );
  });

  it("should throw error if resume data is empty", async () => {
    vi.mocked(getSetting).mockResolvedValue("test-resume-id");
    vi.mocked(getResume).mockResolvedValue({
      id: "test-resume-id",
      data: null,
    } as any);

    await expect(getProfile()).rejects.toThrow(
      "Resume data is empty or invalid",
    );
  });
});
