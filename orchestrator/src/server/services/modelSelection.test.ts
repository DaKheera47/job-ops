// src/server/services/modelSelection.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as settingsRepo from "../repositories/settings.js";
import { pickProjectIdsForJob } from "./projectSelection.js";
import { scoreJobSuitability } from "./scorer.js";
import { generateTailoring } from "./summary.js";

// Mock the settings repository
vi.mock("../repositories/settings.js", () => ({
  getSetting: vi.fn(),
}));

describe("Model Selection Logic", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    // Set environment variables to ensure we don't hit early exits
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: "test-key",
      MODEL: "env-model",
    };

    // Mock global fetch to capture the request and return a dummy success response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                score: 50,
                explanation: "ok",
                summary: "sum",
                headline: "head",
                skills: [],
                selectedProjectIds: ["1"],
              }),
            },
          },
        ],
      }),
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Scoring Service", () => {
    it("should use scoring specific model when set", async () => {
      vi.mocked(settingsRepo.getSetting).mockImplementation(async (key) => {
        if (key === "modelScorer") return "specific-scorer-model";
        if (key === "model") return "global-model";
        return null;
      });

      await scoreJobSuitability(
        { title: "Test Job", jobDescription: "desc" } as any,
        {},
      );

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.model).toBe("specific-scorer-model");
    });

    it("should fall back to global model for scoring when specific not set", async () => {
      vi.mocked(settingsRepo.getSetting).mockImplementation(async (key) => {
        if (key === "modelScorer") return null;
        if (key === "model") return "global-model";
        return null;
      });

      await scoreJobSuitability({ title: "Test Job" } as any, {});

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.model).toBe("global-model");
    });

    it("should fall back to env model for scoring when no settings set", async () => {
      vi.mocked(settingsRepo.getSetting).mockResolvedValue(null);

      await scoreJobSuitability({ title: "Test Job" } as any, {});

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.model).toBe("env-model");
    });
  });

  describe("Tailoring Service", () => {
    it("should use tailoring specific model when set", async () => {
      vi.mocked(settingsRepo.getSetting).mockImplementation(async (key) => {
        if (key === "modelTailoring") return "specific-tailoring-model";
        if (key === "model") return "global-model";
        return null;
      });

      await generateTailoring("job desc", {});

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.model).toBe("specific-tailoring-model");
    });

    it("should fall back to global model when specific not set", async () => {
      vi.mocked(settingsRepo.getSetting).mockImplementation(async (key) => {
        if (key === "modelTailoring") return null;
        if (key === "model") return "global-model";
        return null;
      });

      await generateTailoring("job desc", {});

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.model).toBe("global-model");
    });
  });

  describe("Project Selection Service", () => {
    it("should use project selection specific model when set", async () => {
      vi.mocked(settingsRepo.getSetting).mockImplementation(async (key) => {
        if (key === "modelProjectSelection") return "specific-project-model";
        if (key === "model") return "global-model";
        return null;
      });

      await pickProjectIdsForJob({
        jobDescription: "desc",
        eligibleProjects: [
          {
            id: "1",
            name: "p1",
            description: "d1",
            summaryText: "summary",
          } as any,
        ],
        desiredCount: 1,
      });

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.model).toBe("specific-project-model");
    });

    it("should fall back to global model when specific not set", async () => {
      vi.mocked(settingsRepo.getSetting).mockImplementation(async (key) => {
        if (key === "modelProjectSelection") return null;
        if (key === "model") return "global-model";
        return null;
      });

      await pickProjectIdsForJob({
        jobDescription: "desc",
        eligibleProjects: [
          {
            id: "1",
            name: "p1",
            description: "d1",
            summaryText: "summary",
          } as any,
        ],
        desiredCount: 1,
      });

      const fetchCall = vi.mocked(fetch).mock.calls[0];
      const body = JSON.parse(fetchCall[1]?.body as string);
      expect(body.model).toBe("global-model");
    });
  });
});
