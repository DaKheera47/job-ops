import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveSettings } from "./settings.js";

// Mock the dependencies
vi.mock("../repositories/settings.js", () => ({
  getAllSettings: vi.fn(),
  getSetting: vi.fn(),
}));

vi.mock("./profile.js", () => ({
  getProfile: vi.fn(),
}));

vi.mock("./rxresume-v4.js", () => ({
  getResume: vi.fn(),
  RxResumeCredentialsError: class RxResumeCredentialsError extends Error {
    constructor() {
      super("RxResume credentials not configured.");
      this.name = "RxResumeCredentialsError";
    }
  },
}));

vi.mock("./envSettings.js", () => ({
  getEnvSettingsData: vi.fn(),
}));

import { getAllSettings } from "../repositories/settings.js";
import { getEnvSettingsData } from "./envSettings.js";
import { getProfile } from "./profile.js";

describe("settings service - backward compatibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset environment variables
    delete process.env.GRADCRACKER_ENABLED;
    delete process.env.UKVISAJOBS_ENABLED;
    delete process.env.INDEED_ENABLED;
    delete process.env.LINKEDIN_ENABLED;
  });

  describe("scanner enabled flags default to true when not set", () => {
    it("should default all scanner enabled flags to true when no env vars set", async () => {
      // Mock no database overrides
      vi.mocked(getAllSettings).mockResolvedValue({});
      vi.mocked(getProfile).mockResolvedValue({});
      vi.mocked(getEnvSettingsData).mockResolvedValue({
        ukvisajobsEmail: null,
        rxresumeEmail: null,
        basicAuthUser: null,
        openrouterApiKeyHint: null,
        rxresumePasswordHint: null,
        ukvisajobsPasswordHint: null,
        basicAuthPasswordHint: null,
        webhookSecretHint: null,
      } as Record<string, string | boolean | number | null>);

      const settings = await getEffectiveSettings();

      // All scanner enabled flags should default to true
      expect(settings.gradcrackerEnabled).toBe(true);
      expect(settings.defaultGradcrackerEnabled).toBe(true);
      expect(settings.overrideGradcrackerEnabled).toBeNull();

      expect(settings.ukvisajobsEnabled).toBe(true);
      expect(settings.defaultUkvisajobsEnabled).toBe(true);
      expect(settings.overrideUkvisajobsEnabled).toBeNull();

      expect(settings.indeedEnabled).toBe(true);
      expect(settings.defaultIndeedEnabled).toBe(true);
      expect(settings.overrideIndeedEnabled).toBeNull();

      expect(settings.linkedinEnabled).toBe(true);
      expect(settings.defaultLinkedinEnabled).toBe(true);
      expect(settings.overrideLinkedinEnabled).toBeNull();
    });

    it("should use env var defaults when set", async () => {
      // Set environment variables
      process.env.GRADCRACKER_ENABLED = "false";
      process.env.UKVISAJOBS_ENABLED = "0";
      process.env.INDEED_ENABLED = "no";
      process.env.LINKEDIN_ENABLED = "true";

      // Mock no database overrides
      vi.mocked(getAllSettings).mockResolvedValue({});
      vi.mocked(getProfile).mockResolvedValue({});
      vi.mocked(getEnvSettingsData).mockResolvedValue({
        ukvisajobsEmail: null,
        rxresumeEmail: null,
        basicAuthUser: null,
        openrouterApiKeyHint: null,
        rxresumePasswordHint: null,
        ukvisajobsPasswordHint: null,
        basicAuthPasswordHint: null,
        webhookSecretHint: null,
      } as Record<string, string | boolean | number | null>);

      const settings = await getEffectiveSettings();

      // Environment defaults should be respected
      expect(settings.defaultGradcrackerEnabled).toBe(false);
      expect(settings.gradcrackerEnabled).toBe(false);

      expect(settings.defaultUkvisajobsEnabled).toBe(false);
      expect(settings.ukvisajobsEnabled).toBe(false);

      expect(settings.defaultIndeedEnabled).toBe(false);
      expect(settings.indeedEnabled).toBe(false);

      expect(settings.defaultLinkedinEnabled).toBe(true);
      expect(settings.linkedinEnabled).toBe(true);
    });

    it("should use database overrides when present", async () => {
      // Set environment variables to true
      process.env.GRADCRACKER_ENABLED = "true";
      process.env.UKVISAJOBS_ENABLED = "true";
      process.env.INDEED_ENABLED = "true";
      process.env.LINKEDIN_ENABLED = "true";

      // Mock database overrides to false
      vi.mocked(getAllSettings).mockResolvedValue({
        gradcrackerEnabled: "false",
        ukvisajobsEnabled: "0",
        indeedEnabled: "false",
        linkedinEnabled: "0",
      });
      vi.mocked(getProfile).mockResolvedValue({});
      vi.mocked(getEnvSettingsData).mockResolvedValue({
        ukvisajobsEmail: null,
        rxresumeEmail: null,
        basicAuthUser: null,
        openrouterApiKeyHint: null,
        rxresumePasswordHint: null,
        ukvisajobsPasswordHint: null,
        basicAuthPasswordHint: null,
        webhookSecretHint: null,
      } as Record<string, string | boolean | number | null>);

      const settings = await getEffectiveSettings();

      // Database overrides should take precedence
      expect(settings.defaultGradcrackerEnabled).toBe(true);
      expect(settings.overrideGradcrackerEnabled).toBe(false);
      expect(settings.gradcrackerEnabled).toBe(false);

      expect(settings.defaultUkvisajobsEnabled).toBe(true);
      expect(settings.overrideUkvisajobsEnabled).toBe(false);
      expect(settings.ukvisajobsEnabled).toBe(false);

      expect(settings.defaultIndeedEnabled).toBe(true);
      expect(settings.overrideIndeedEnabled).toBe(false);
      expect(settings.indeedEnabled).toBe(false);

      expect(settings.defaultLinkedinEnabled).toBe(true);
      expect(settings.overrideLinkedinEnabled).toBe(false);
      expect(settings.linkedinEnabled).toBe(false);
    });

    it("should handle invalid env var values by defaulting to true", async () => {
      // Set invalid environment variables
      process.env.GRADCRACKER_ENABLED = "invalid";
      process.env.UKVISAJOBS_ENABLED = "maybe";
      process.env.INDEED_ENABLED = "2";
      process.env.LINKEDIN_ENABLED = "";

      // Mock no database overrides
      vi.mocked(getAllSettings).mockResolvedValue({});
      vi.mocked(getProfile).mockResolvedValue({});
      vi.mocked(getEnvSettingsData).mockResolvedValue({
        ukvisajobsEmail: null,
        rxresumeEmail: null,
        basicAuthUser: null,
        openrouterApiKeyHint: null,
        rxresumePasswordHint: null,
        ukvisajobsPasswordHint: null,
        basicAuthPasswordHint: null,
        webhookSecretHint: null,
      } as Record<string, string | boolean | number | null>);

      const settings = await getEffectiveSettings();

      // Invalid values should default to true
      expect(settings.gradcrackerEnabled).toBe(true);
      expect(settings.ukvisajobsEnabled).toBe(true);
      expect(settings.indeedEnabled).toBe(true);
      expect(settings.linkedinEnabled).toBe(true);
    });
  });

  describe("backward compatibility with existing installations", () => {
    it("should preserve existing behavior when no scanner flags are set", async () => {
      // Mock a typical existing installation (no scanner enabled fields)
      vi.mocked(getAllSettings).mockResolvedValue({
        model: "google/gemini-3-flash-preview",
        rxresumeBaseResumeId: "some-resume-id",
      });
      vi.mocked(getProfile).mockResolvedValue({});
      vi.mocked(getEnvSettingsData).mockResolvedValue({
        ukvisajobsEmail: "user@example.com",
        rxresumeEmail: "user@example.com",
        basicAuthUser: null,
        openrouterApiKeyHint: null,
        rxresumePasswordHint: "***",
        ukvisajobsPasswordHint: "***",
        basicAuthPasswordHint: null,
        webhookSecretHint: null,
      } as Record<string, string | boolean | number | null>);

      const settings = await getEffectiveSettings();

      // All scanners should be enabled by default (backward compatibility)
      expect(settings.gradcrackerEnabled).toBe(true);
      expect(settings.ukvisajobsEnabled).toBe(true);
      expect(settings.indeedEnabled).toBe(true);
      expect(settings.linkedinEnabled).toBe(true);

      // Other settings should remain unchanged
      expect(settings.model).toBe("google/gemini-3-flash-preview");
    });
  });
});
