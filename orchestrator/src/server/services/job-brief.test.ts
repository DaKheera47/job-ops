import { beforeEach, describe, expect, it, vi } from "vitest";

const { callJsonMock, createConfiguredLlmServiceMock, resolveLlmModelMock } =
  vi.hoisted(() => ({
    callJsonMock: vi.fn(),
    createConfiguredLlmServiceMock: vi.fn(),
    resolveLlmModelMock: vi.fn(),
  }));

vi.mock("@infra/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock("./modelSelection", () => ({
  createConfiguredLlmService: createConfiguredLlmServiceMock,
  resolveLlmModel: resolveLlmModelMock,
}));

import { logger } from "@infra/logger";
import { generateJobBrief } from "./job-brief";

describe("generateJobBrief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveLlmModelMock.mockResolvedValue("gemini-flash");
    createConfiguredLlmServiceMock.mockResolvedValue({
      callJson: callJsonMock,
    });
  });

  it("extracts and serializes a UI-ready job brief", async () => {
    callJsonMock.mockResolvedValue({
      success: true,
      data: {
        role_summary: "Build internal platform tools.",
        they_want: ["TypeScript", "React"],
        specifics: ["React", "Node.js", "PostgreSQL"],
        company_offers: ["Mentorship"],
        practical_details: ["Salary: Not stated"],
        missing_or_unclear: ["Sponsorship not stated"],
        repeated_signals: ["Collaboration"],
      },
    });

    const result = await generateJobBrief("We need React and Node.js.", {
      jobId: "job-1",
    });

    expect(resolveLlmModelMock).toHaveBeenCalledWith("scoring");
    expect(callJsonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-flash",
        jobId: "job-1",
        messages: [
          expect.objectContaining({
            role: "system",
            content: expect.stringContaining("Your job is NOT to judge"),
          }),
          expect.objectContaining({
            role: "user",
            content: expect.stringContaining("We need React and Node.js."),
          }),
        ],
      }),
    );
    expect(result).toBeTruthy();
    expect(JSON.parse(result as string)).toEqual({
      role_summary: "Build internal platform tools.",
      they_want: ["TypeScript", "React"],
      specifics: ["React", "Node.js", "PostgreSQL"],
      company_offers: ["Mentorship"],
      practical_details: ["Salary: Not stated"],
      missing_or_unclear: ["Sponsorship not stated"],
      repeated_signals: ["Collaboration"],
    });
  });

  it("returns null when the model call fails", async () => {
    callJsonMock.mockResolvedValue({
      success: false,
      error: "nope",
    });

    await expect(
      generateJobBrief("JD", { jobId: "job-1" }),
    ).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      "Job brief extraction failed",
      expect.objectContaining({ jobId: "job-1", error: "nope" }),
    );
  });

  it("returns null for missing descriptions without calling the model", async () => {
    await expect(generateJobBrief("   ")).resolves.toBeNull();
    expect(callJsonMock).not.toHaveBeenCalled();
  });
});
