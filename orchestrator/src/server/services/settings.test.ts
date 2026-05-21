import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/repositories/settings", () => ({
  getAllSettings: vi.fn(),
}));

vi.mock("@infra/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock("./design-resume", () => ({
  getCurrentDesignResumeOrNullOnLegacy: vi.fn(),
  designResumeToProfile: vi.fn(),
}));

vi.mock("./envSettings", () => ({
  getEnvSettingsData: vi.fn(),
  getOriginalEnvValue: vi.fn(),
}));

vi.mock("./profile", () => ({
  getProfile: vi.fn(),
}));

vi.mock("./resumeProjects", () => ({
  extractProjectsFromProfile: vi.fn(),
  resolveResumeProjectsSettings: vi.fn(),
}));

vi.mock("./rxresume", () => ({
  extractProjectsFromResume: vi.fn(),
  getResume: vi.fn(),
  RxResumeAuthConfigError: class RxResumeAuthConfigError extends Error {},
}));

import { logger } from "@infra/logger";
import { getAllSettings } from "@server/repositories/settings";
import {
  designResumeToProfile,
  getCurrentDesignResumeOrNullOnLegacy,
} from "./design-resume";
import { getEnvSettingsData } from "./envSettings";
import { getProfile } from "./profile";
import {
  extractProjectsFromProfile,
  resolveResumeProjectsSettings,
} from "./resumeProjects";
import { extractProjectsFromResume } from "./rxresume";
import { getEffectiveSettings } from "./settings";

describe("getEffectiveSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAllSettings).mockResolvedValue({});
    vi.mocked(getCurrentDesignResumeOrNullOnLegacy).mockResolvedValue({
      id: "primary",
      resumeJson: {},
    } as never);
    vi.mocked(designResumeToProfile).mockResolvedValue({
      basics: { name: "Local User" },
      sections: { projects: { items: [] } },
    } as never);
    vi.mocked(getEnvSettingsData).mockResolvedValue({} as never);
    vi.mocked(getProfile).mockResolvedValue({} as never);
    vi.mocked(extractProjectsFromProfile).mockReturnValue({
      catalog: [{ id: "local-project", label: "Local project" }],
      selectionItems: [],
    } as never);
    vi.mocked(extractProjectsFromResume).mockImplementation(() => {
      throw new Error("should not use RxResume extractor for local profile");
    });
    vi.mocked(resolveResumeProjectsSettings).mockImplementation(
      ({ catalog }) =>
        ({
          profileProjects: catalog,
          resumeProjects: {
            lockedProjectIds: [],
            aiSelectableProjectIds: [],
            maxProjects: 3,
          },
          defaultResumeProjects: {
            lockedProjectIds: [],
            aiSelectableProjectIds: [],
            maxProjects: 3,
          },
          overrideResumeProjects: null,
        }) as never,
    );
  });

  it("uses extractProjectsFromProfile for a local Resume Studio projection", async () => {
    const settings = await getEffectiveSettings();

    expect(extractProjectsFromProfile).toHaveBeenCalledTimes(1);
    expect(extractProjectsFromResume).not.toHaveBeenCalled();
    expect(settings.profileProjects).toEqual([
      { id: "local-project", label: "Local project" },
    ]);
  });

  it("falls back when no compatible local Resume Studio document is available", async () => {
    vi.mocked(getCurrentDesignResumeOrNullOnLegacy).mockResolvedValue(null);

    await expect(getEffectiveSettings()).resolves.toBeTruthy();
    expect(designResumeToProfile).not.toHaveBeenCalled();
  });

  it("does not warn when settings have no local or Reactive Resume base profile yet", async () => {
    vi.mocked(getCurrentDesignResumeOrNullOnLegacy).mockResolvedValue(null);
    vi.mocked(getProfile).mockRejectedValue(
      new Error(
        "Base resume not configured. Please select a base resume from your RxResume account in Settings.",
      ),
    );

    await expect(getEffectiveSettings()).resolves.toBeTruthy();
    expect(logger.warn).not.toHaveBeenCalledWith(
      "Failed to load base resume profile for settings",
      expect.any(Object),
    );
  });

  it("exposes purpose overrides and redacted purpose API key hints", async () => {
    vi.mocked(getAllSettings).mockResolvedValue({
      llmPurposeOverrides: JSON.stringify({
        tailoring: { provider: "openai", model: "gpt-5.4-mini" },
      }),
      llmPurposeApiKeys: JSON.stringify({ tailoring: "sk-purpose" }),
    } as never);

    const settings = await getEffectiveSettings();

    expect(settings.llmPurposeOverrides.override).toEqual({
      tailoring: { provider: "openai", model: "gpt-5.4-mini" },
    });
    expect(settings.llmPurposeApiKeyHints).toEqual({ tailoring: "sk-p" });
  });
});
