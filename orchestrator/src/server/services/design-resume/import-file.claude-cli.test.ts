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

const { callJsonMock, MockClaudeCliClass } = vi.hoisted(() => {
  const callJson = vi.fn();
  class MockClaudeCliClass {
    callJson = callJson;
  }
  return { callJsonMock: callJson, MockClaudeCliClass };
});

vi.mock("@server/services/modelSelection", () => modelSelection);
vi.mock("./index", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./index")>()),
  ...designResumeService,
}));
vi.mock("@server/infra/request-context", () => requestContext);
vi.mock("pdf-parse", () => ({
  default: vi.fn().mockResolvedValue({ text: "Jane Doe\nSoftware Engineer" }),
}));
vi.mock("@server/services/llm/claude-cli/client", () => ({
  ClaudeCliClient: MockClaudeCliClass,
}));

import pdfParse from "pdf-parse";
import { importDesignResumeFromFile } from "./import-file";

describe("importDesignResumeFromFile (claude_cli)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callJsonMock.mockResolvedValue({
      text: JSON.stringify(buildDefaultReactiveResumeDocument()),
    });
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValue({
      provider: "claude_cli",
      model: "claude-sonnet-5",
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

  it("extracts PDF text locally and calls Claude CLI without an HTTP API key", async () => {
    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("%PDF-1.4 fake").toString("base64"),
    });

    expect(callJsonMock).toHaveBeenCalledOnce();
    expect(vi.mocked(pdfParse)).toHaveBeenCalledOnce();
  });
});
