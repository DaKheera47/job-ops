import type { ResumeProjectsSettingsInput } from "@shared/settings-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applySettingsUpdates } from "./apply-updates";

vi.mock("@server/repositories/settings", () => ({
  setSetting: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@server/services/envSettings", () => ({
  applyEnvValue: vi.fn(),
  normalizeEnvInput: (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  },
}));

vi.mock("@server/services/profile", () => ({
  getProfile: vi.fn(),
}));

vi.mock("@server/services/resumeProjects", () => ({
  extractProjectsFromProfile: vi.fn(),
  normalizeResumeProjectsSettings: vi.fn(),
}));

describe("applySettingsUpdates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies representative handlers and env side effects", async () => {
    const settingsRepo = await import("@server/repositories/settings");
    const envSettings = await import("@server/services/envSettings");

    const plan = await applySettingsUpdates({
      model: "gpt-4o-mini",
      ukvisajobsMaxJobs: 42,
      searchTerms: ["backend", "platform"],
      jobspyIsRemote: true,
      llmProvider: "openai",
    });

    expect(settingsRepo.setSetting).toHaveBeenCalledTimes(5);
    expect(vi.mocked(settingsRepo.setSetting).mock.calls).toEqual(
      expect.arrayContaining([
        ["model", "gpt-4o-mini"],
        ["ukvisajobsMaxJobs", "42"],
        ["searchTerms", '["backend","platform"]'],
        ["jobspyIsRemote", "1"],
        ["llmProvider", "openai"],
      ]),
    );
    expect(envSettings.applyEnvValue).toHaveBeenCalledWith(
      "LLM_PROVIDER",
      "openai",
    );
    expect(plan.shouldRefreshBackupScheduler).toBe(false);
  });

  it("handles deprecated openrouterApiKey migration path", async () => {
    const settingsRepo = await import("@server/repositories/settings");
    const envSettings = await import("@server/services/envSettings");
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await applySettingsUpdates({
      openrouterApiKey: " legacy-key ",
    });

    expect(vi.mocked(settingsRepo.setSetting).mock.calls).toEqual(
      expect.arrayContaining([
        ["llmApiKey", "legacy-key"],
        ["openrouterApiKey", null],
      ]),
    );
    expect(envSettings.applyEnvValue).toHaveBeenCalledWith(
      "LLM_API_KEY",
      "legacy-key",
    );
    expect(envSettings.applyEnvValue).toHaveBeenCalledWith(
      "OPENROUTER_API_KEY",
      null,
    );
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("marks backup scheduler refresh when backup settings are changed", async () => {
    const settingsRepo = await import("@server/repositories/settings");

    const plan = await applySettingsUpdates({
      backupEnabled: false,
      backupHour: 4,
    });

    expect(vi.mocked(settingsRepo.setSetting).mock.calls).toEqual(
      expect.arrayContaining([
        ["backupEnabled", "0"],
        ["backupHour", "4"],
      ]),
    );
    expect(plan.shouldRefreshBackupScheduler).toBe(true);
  });

  it("resolves and persists normalized resumeProjects", async () => {
    const settingsRepo = await import("@server/repositories/settings");
    const profileService = await import("@server/services/profile");
    const resumeProjectsService = await import(
      "@server/services/resumeProjects"
    );

    const input: ResumeProjectsSettingsInput = {
      maxProjects: 2,
      lockedProjectIds: ["proj-1"],
      aiSelectableProjectIds: ["proj-2"],
    };
    const normalized: ResumeProjectsSettingsInput = {
      maxProjects: 1,
      lockedProjectIds: ["proj-1"],
      aiSelectableProjectIds: [],
    };

    vi.mocked(profileService.getProfile).mockResolvedValue({} as any);
    vi.mocked(resumeProjectsService.extractProjectsFromProfile).mockReturnValue(
      {
        catalog: [{ id: "proj-1" }, { id: "proj-2" }] as any,
        selectionItems: [],
      },
    );
    vi.mocked(
      resumeProjectsService.normalizeResumeProjectsSettings,
    ).mockReturnValue(normalized as any);

    await applySettingsUpdates({ resumeProjects: input });

    expect(profileService.getProfile).toHaveBeenCalledOnce();
    const allowedSet = vi.mocked(
      resumeProjectsService.normalizeResumeProjectsSettings,
    ).mock.calls[0]?.[1];
    expect(allowedSet).toBeInstanceOf(Set);
    expect(Array.from(allowedSet as Set<string>).sort()).toEqual([
      "proj-1",
      "proj-2",
    ]);
    expect(vi.mocked(settingsRepo.setSetting)).toHaveBeenCalledWith(
      "resumeProjects",
      JSON.stringify(normalized),
    );
  });
});
