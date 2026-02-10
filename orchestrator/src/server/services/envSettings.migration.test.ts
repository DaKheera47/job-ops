import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe.sequential("envSettings migration", () => {
  let tempDir: string;
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-env-migration-test-"));
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      NODE_ENV: "test",
      MODEL: "test-model",
    };

    await import("../db/migrate");
    const dbMod = await import("../db/index");
    closeDb = dbMod.closeDb;
  });

  afterEach(async () => {
    if (closeDb) closeDb();
    await rm(tempDir, { recursive: true, force: true });
    process.env = { ...originalEnv };
  });

  it("migrates stored openrouterApiKey -> llmApiKey for openrouter provider", async () => {
    const settingsRepo = await import("../repositories/settings");
    const { applyStoredEnvOverrides } = await import("./envSettings");

    await settingsRepo.setSetting("llmProvider", "openrouter");
    await settingsRepo.setSetting("openrouterApiKey", "sk-or-legacy");
    await settingsRepo.setSetting("llmApiKey", null);

    await applyStoredEnvOverrides();

    expect(await settingsRepo.getSetting("llmApiKey")).toBe("sk-or-legacy");
    expect(await settingsRepo.getSetting("openrouterApiKey")).toBe(null);
    expect(process.env.LLM_API_KEY).toBe("sk-or-legacy");
  });

  it("does not migrate openrouterApiKey when provider is not openrouter", async () => {
    const settingsRepo = await import("../repositories/settings");
    const { applyStoredEnvOverrides } = await import("./envSettings");

    await settingsRepo.setSetting("llmProvider", "openai");
    await settingsRepo.setSetting("openrouterApiKey", "sk-or-legacy");
    await settingsRepo.setSetting("llmApiKey", null);

    await applyStoredEnvOverrides();

    expect(await settingsRepo.getSetting("llmApiKey")).toBe(null);
    expect(await settingsRepo.getSetting("openrouterApiKey")).toBe(
      "sk-or-legacy",
    );
  });

  it("seeds LLM settings from environment when DB overrides are empty", async () => {
    const settingsRepo = await import("../repositories/settings");
    const { applyStoredEnvOverrides } = await import("./envSettings");

    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_BASE_URL", "https://api.openai.com/v1");
    vi.stubEnv("LLM_API_KEY", "sk-env-bootstrap");

    await settingsRepo.setSetting("llmProvider", null);
    await settingsRepo.setSetting("llmBaseUrl", null);
    await settingsRepo.setSetting("llmApiKey", null);

    await applyStoredEnvOverrides();

    expect(await settingsRepo.getSetting("llmProvider")).toBe("openai");
    expect(await settingsRepo.getSetting("llmBaseUrl")).toBe(
      "https://api.openai.com/v1",
    );
    expect(await settingsRepo.getSetting("llmApiKey")).toBe("sk-env-bootstrap");
  });

  it("does not overwrite existing LLM DB overrides with environment values", async () => {
    const settingsRepo = await import("../repositories/settings");
    const { applyStoredEnvOverrides } = await import("./envSettings");

    vi.stubEnv("LLM_PROVIDER", "openai");
    vi.stubEnv("LLM_BASE_URL", "https://api.openai.com/v1");
    vi.stubEnv("LLM_API_KEY", "sk-env-bootstrap");

    await settingsRepo.setSetting("llmProvider", "ollama");
    await settingsRepo.setSetting("llmBaseUrl", "http://localhost:11434/v1");
    await settingsRepo.setSetting("llmApiKey", "sk-db-value");

    await applyStoredEnvOverrides();

    expect(await settingsRepo.getSetting("llmProvider")).toBe("ollama");
    expect(await settingsRepo.getSetting("llmBaseUrl")).toBe(
      "http://localhost:11434/v1",
    );
    expect(await settingsRepo.getSetting("llmApiKey")).toBe("sk-db-value");
  });
});
