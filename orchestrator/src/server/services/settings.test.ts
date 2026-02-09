import * as settingsRepo from "@server/repositories/settings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveSettings } from "./settings";

vi.mock("@server/repositories/settings", () => ({
  getAllSettings: vi.fn(),
}));

vi.mock("./envSettings", () => ({
  getEnvSettingsData: vi.fn().mockResolvedValue({}),
}));

vi.mock("./profile", () => ({
  getProfile: vi.fn().mockResolvedValue({}),
}));

vi.mock("./resumeProjects", () => ({
  extractProjectsFromProfile: vi.fn().mockReturnValue({
    catalog: [],
    selectionItems: [],
  }),
  resolveResumeProjectsSettings: vi.fn().mockReturnValue({
    profileProjects: [],
    resumeProjects: {
      maxProjects: 0,
      lockedProjectIds: [],
      aiSelectableProjectIds: [],
    },
    defaultResumeProjects: {
      maxProjects: 0,
      lockedProjectIds: [],
      aiSelectableProjectIds: [],
    },
    overrideResumeProjects: null,
  }),
}));

vi.mock("./rxresume-v4", () => ({
  getResume: vi.fn().mockResolvedValue({ data: { basics: {} } }),
  RxResumeCredentialsError: class RxResumeCredentialsError extends Error {},
}));

function mockSettings(overrides: Record<string, string | null | undefined>) {
  vi.mocked(settingsRepo.getAllSettings).mockResolvedValue(overrides as any);
}

describe("settings pdf generation mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("RXRESUME_EMAIL", "");
    vi.stubEnv("RXRESUME_PASSWORD", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("auto-detects as enabled when RxResume credentials and base resume are configured", async () => {
    mockSettings({
      rxresumeEmail: "rx@example.com",
      rxresumePassword: "secret",
      rxresumeBaseResumeId: "resume-1",
    });

    const settings = await getEffectiveSettings();

    expect(settings.defaultPdfGenerationEnabled).toBe(true);
    expect(settings.overridePdfGenerationEnabled).toBeNull();
    expect(settings.pdfGenerationEnabled).toBe(true);
  });

  it("auto-detects as disabled when setup is incomplete", async () => {
    mockSettings({
      rxresumeEmail: "rx@example.com",
      rxresumePassword: "secret",
    });

    const settings = await getEffectiveSettings();

    expect(settings.defaultPdfGenerationEnabled).toBe(false);
    expect(settings.overridePdfGenerationEnabled).toBeNull();
    expect(settings.pdfGenerationEnabled).toBe(false);
  });

  it("uses override=false to disable PDF generation even when configured", async () => {
    mockSettings({
      rxresumeEmail: "rx@example.com",
      rxresumePassword: "secret",
      rxresumeBaseResumeId: "resume-1",
      pdfGenerationEnabled: "0",
    });

    const settings = await getEffectiveSettings();

    expect(settings.defaultPdfGenerationEnabled).toBe(true);
    expect(settings.overridePdfGenerationEnabled).toBe(false);
    expect(settings.pdfGenerationEnabled).toBe(false);
  });

  it("uses override=true to enable PDF generation", async () => {
    mockSettings({
      pdfGenerationEnabled: "1",
    });

    const settings = await getEffectiveSettings();

    expect(settings.defaultPdfGenerationEnabled).toBe(false);
    expect(settings.overridePdfGenerationEnabled).toBe(true);
    expect(settings.pdfGenerationEnabled).toBe(true);
  });
});
