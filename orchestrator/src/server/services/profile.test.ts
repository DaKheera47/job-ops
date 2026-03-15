import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearProfileCache, getProfile } from "./profile";

vi.mock("./platform/resumeStudio", () => ({
  getCanonicalResumeAccess: vi.fn(),
  getCanonicalResumeSelection: vi.fn(),
}));

vi.mock("./rxresume", () => ({
  RxResumeAuthConfigError: class RxResumeAuthConfigError extends Error {
    constructor() {
      super("Reactive Resume credentials not configured.");
      this.name = "RxResumeAuthConfigError";
    }
  },
}));

import {
  getCanonicalResumeAccess,
  getCanonicalResumeSelection,
} from "./platform/resumeStudio";
import { RxResumeAuthConfigError } from "./rxresume";

function buildSelection(rxresumeResumeId = "test-resume-id") {
  return {
    workspace: { id: "workspace-1", name: "Gipfeli", slug: "gipfeli" },
    profile: {
      id: "profile-1",
      workspaceId: "workspace-1",
      label: "Primary",
      isDefault: true,
    },
    canonicalResume: {
      id: `canonical-${rxresumeResumeId}`,
      workspaceId: "workspace-1",
      profileId: "profile-1",
      source: "rxresume" as const,
      rxresumeResumeId,
    },
  };
}

function buildAccess(resumeData: unknown, rxresumeResumeId = "test-resume-id") {
  return {
    ...buildSelection(rxresumeResumeId),
    resume: {
      id: rxresumeResumeId,
      data: resumeData,
    },
  };
}

describe("getProfile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearProfileCache();
  });

  it("should fetch profile through the platform canonical access boundary", async () => {
    const mockResumeData = { basics: { name: "Test User" } };
    vi.mocked(getCanonicalResumeSelection).mockResolvedValue(
      buildSelection() as never,
    );
    vi.mocked(getCanonicalResumeAccess).mockResolvedValue(
      buildAccess(mockResumeData) as never,
    );

    await expect(getProfile()).resolves.toEqual(mockResumeData);
    expect(getCanonicalResumeSelection).toHaveBeenCalledWith({
      bootstrapFromLegacy: true,
    });
    expect(getCanonicalResumeAccess).toHaveBeenCalledWith({
      profileId: "profile-1",
      workspaceId: "workspace-1",
      bootstrapFromLegacy: false,
    });
  });

  it("should cache the profile and not refetch on subsequent calls", async () => {
    const mockResumeData = { basics: { name: "Test User" } };
    vi.mocked(getCanonicalResumeSelection).mockResolvedValue(
      buildSelection() as never,
    );
    vi.mocked(getCanonicalResumeAccess).mockResolvedValue(
      buildAccess(mockResumeData) as never,
    );

    await getProfile();
    await getProfile();

    expect(getCanonicalResumeSelection).toHaveBeenCalledTimes(2);
    expect(getCanonicalResumeAccess).toHaveBeenCalledTimes(1);
  });

  it("should refetch when forceRefresh is true", async () => {
    const mockResumeData = { basics: { name: "Test User" } };
    vi.mocked(getCanonicalResumeSelection).mockResolvedValue(
      buildSelection() as never,
    );
    vi.mocked(getCanonicalResumeAccess).mockResolvedValue(
      buildAccess(mockResumeData) as never,
    );

    await getProfile();
    await getProfile(true);

    expect(getCanonicalResumeAccess).toHaveBeenCalledTimes(2);
  });

  it("should throw user-friendly error on credential issues", async () => {
    vi.mocked(getCanonicalResumeSelection).mockResolvedValue(
      buildSelection() as never,
    );
    vi.mocked(getCanonicalResumeAccess).mockRejectedValue(
      new (RxResumeAuthConfigError as unknown as new () => Error)(),
    );

    await expect(getProfile()).rejects.toThrow(
      "Reactive Resume credentials not configured.",
    );
  });

  it("should throw error if resume data is empty", async () => {
    vi.mocked(getCanonicalResumeSelection).mockResolvedValue(
      buildSelection() as never,
    );
    vi.mocked(getCanonicalResumeAccess).mockResolvedValue(
      buildAccess(null) as never,
    );

    await expect(getProfile()).rejects.toThrow(
      "Resume data is empty or invalid",
    );
  });

  it("should invalidate the cache when the canonical resume id changes", async () => {
    vi.mocked(getCanonicalResumeSelection)
      .mockResolvedValueOnce(buildSelection("resume-v1") as never)
      .mockResolvedValueOnce(buildSelection("resume-v2") as never);
    vi.mocked(getCanonicalResumeAccess)
      .mockResolvedValueOnce(
        buildAccess({ basics: { name: "First Resume" } }, "resume-v1") as never,
      )
      .mockResolvedValueOnce(
        buildAccess(
          { basics: { name: "Second Resume" } },
          "resume-v2",
        ) as never,
      );

    await expect(getProfile()).resolves.toEqual({
      basics: { name: "First Resume" },
    });
    await expect(getProfile()).resolves.toEqual({
      basics: { name: "Second Resume" },
    });

    expect(getCanonicalResumeSelection).toHaveBeenCalledTimes(2);
    expect(getCanonicalResumeAccess).toHaveBeenCalledTimes(2);
  });
});
