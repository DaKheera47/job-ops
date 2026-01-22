import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as settingsRepo from "../repositories/settings.js";
import { inferManualJobDetails } from "./manualJob.js";

vi.mock("../repositories/settings.js", () => ({
  getSetting: vi.fn(),
  getAllSettings: vi.fn().mockResolvedValue({}),
}));

const originalEnv = process.env;
const originalFetch = global.fetch;

describe("manual job inference", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv, OPENROUTER_API_KEY: "test-key" };
    global.fetch = vi.fn();
    vi.mocked(settingsRepo.getSetting).mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns a warning when the API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const result = await inferManualJobDetails("JD text");

    expect(result.job).toEqual({});
    expect(result.warning).toContain("OPENROUTER_API_KEY not set");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("parses JSON even when wrapped in markdown fences", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                "Here is the data: ```json\n{ \"title\": \"Backend Engineer\", \"employer\": \"Acme\", \"salary\": \" 100k \" }\n```",
            },
          },
        ],
      }),
    } as any);

    const result = await inferManualJobDetails("JD text");

    expect(result.warning).toBeUndefined();
    expect(result.job).toMatchObject({
      title: "Backend Engineer",
      employer: "Acme",
      salary: "100k",
    });
  });

  it("returns a warning when the API response fails", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
    } as any);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await inferManualJobDetails("JD text");

    expect(result.job).toEqual({});
    expect(result.warning).toContain("AI inference failed");
    warnSpy.mockRestore();
  });
});
