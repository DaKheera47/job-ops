import type { DesignResumeJson } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultReactiveResumeDocument } from "../rxresume/document";

const modelSelection = vi.hoisted(() => ({
  resolveLlmRuntimeSettings: vi.fn(),
}));

const designResumeService = vi.hoisted(() => ({
  replaceCurrentDesignResumeDocument: vi.fn(),
}));

const requestContext = vi.hoisted(() => ({
  getRequestContext: vi.fn(() => ({ requestId: "req-cli" })),
  getRequestId: vi.fn(() => "req-cli"),
}));

const { callJsonMock, MockGeminiCliClass } = vi.hoisted(() => {
  const callJson = vi.fn();
  class MockGeminiCliClass {
    callJson = callJson;
  }
  return { callJsonMock: callJson, MockGeminiCliClass };
});

vi.mock("@server/services/modelSelection", () => modelSelection);
vi.mock("./index", () => designResumeService);
vi.mock("@server/infra/request-context", () => requestContext);
vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({ text: "Jane Doe\nSoftware Engineer" }),
}));
vi.mock("@server/services/llm/gemini-cli/client", () => ({
  GeminiCliClient: MockGeminiCliClass,
}));

import pdfParse from "pdf-parse";
import { importDesignResumeFromFile } from "./import-file";

describe("importDesignResumeFromFile (gemini_cli)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callJsonMock.mockResolvedValue({
      text: JSON.stringify(buildDefaultReactiveResumeDocument()),
    });
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValue({
      provider: "gemini_cli",
      model: "google/gemini-2.5-flash",
      baseUrl: null,
      apiKey: null,
    });
    designResumeService.replaceCurrentDesignResumeDocument.mockImplementation(
      async ({ resumeJson }: { resumeJson: DesignResumeJson }) => ({
        id: "primary",
        title: "Imported",
        resumeJson,
        revision: 1,
        sourceResumeId: null,
        sourceMode: null,
        importedAt: "2026-04-27T00:00:00.000Z",
        createdAt: "2026-04-27T00:00:00.000Z",
        updatedAt: "2026-04-27T00:00:00.000Z",
        assets: [],
      }),
    );
  });

  it("extracts PDF text locally and calls Gemini CLI without an HTTP API key", async () => {
    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("%PDF-1.4 fake").toString("base64"),
    });

    expect(callJsonMock).toHaveBeenCalledOnce();
    expect(vi.mocked(pdfParse)).toHaveBeenCalledOnce();
  });
});
