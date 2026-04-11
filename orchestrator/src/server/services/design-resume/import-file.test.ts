import { AppError } from "@infra/errors";
import type { DesignResumeDocument, DesignResumeJson } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultReactiveResumeDocument } from "../rxresume/document";

const modelSelection = vi.hoisted(() => ({
  resolveLlmRuntimeSettings: vi.fn(),
}));

const designResumeService = vi.hoisted(() => ({
  replaceCurrentDesignResumeDocument: vi.fn(),
}));

const requestContext = vi.hoisted(() => ({
  getRequestId: vi.fn(() => "req-123"),
}));

vi.mock("@server/services/modelSelection", () => modelSelection);
vi.mock("./index", () => designResumeService);
vi.mock("@server/infra/request-context", () => requestContext);

import { importDesignResumeFromFile } from "./import-file";

function makeResumeDocument(
  resumeJson: DesignResumeJson = buildDefaultReactiveResumeDocument() as DesignResumeJson,
): DesignResumeDocument {
  return {
    id: "primary",
    title: "Taylor Resume",
    resumeJson,
    revision: 1,
    sourceResumeId: null,
    sourceMode: null,
    importedAt: "2026-04-11T00:00:00.000Z",
    createdAt: "2026-04-11T00:00:00.000Z",
    updatedAt: "2026-04-11T00:00:00.000Z",
    assets: [],
  };
}

describe("importDesignResumeFromFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValue({
      provider: "openai",
      model: "gpt-4.1",
      baseUrl: null,
      apiKey: "sk-test",
    });
    designResumeService.replaceCurrentDesignResumeDocument.mockImplementation(
      async ({ resumeJson }: { resumeJson: DesignResumeJson }) =>
        makeResumeDocument(resumeJson),
    );
  });

  it("sends the attached file directly to the configured model and saves the normalized document", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: `\`\`\`json
{
  "basics": { "name": "Taylor Quinn" },
  "sections": {
    "experience": {
      "items": [
        { "company": "", "position": "Ignored" },
        {
          "company": "Acme",
          "position": "Engineer",
          "period": "2023-2025",
          "description": "<p>Built product features.</p>"
        }
      ]
    }
  }
}
\`\`\``,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("pdf-data").toString("base64"),
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"type":"input_file"'),
      }),
    );
    expect(
      designResumeService.replaceCurrentDesignResumeDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMode: null,
        sourceResumeId: null,
        resumeJson: expect.objectContaining({
          basics: expect.objectContaining({
            name: "Taylor Quinn",
          }),
        }),
      }),
    );

    const savedInput =
      designResumeService.replaceCurrentDesignResumeDocument.mock.calls[0]?.[0];
    const experienceItems =
      savedInput?.resumeJson?.sections?.experience?.items ?? [];

    expect(experienceItems).toHaveLength(1);
    expect(experienceItems[0]).toMatchObject({
      company: "Acme",
      position: "Engineer",
      hidden: false,
    });
    expect(result.title).toBe("Taylor Resume");
  });

  it("returns a capability error when the configured provider does not support direct file import", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "ollama",
      model: "llama3",
      baseUrl: "http://localhost:11434",
      apiKey: "unused",
    });

    await expect(
      importDesignResumeFromFile({
        fileName: "resume.pdf",
        mediaType: "application/pdf",
        dataBase64: Buffer.from("pdf-data").toString("base64"),
      }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("Resume file import is not available"),
    });
  });

  it("surfaces a model capability error instead of falling back to local extraction", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "This model does not support input_file attachments.",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    let thrown: unknown;
    try {
      await importDesignResumeFromFile({
        fileName: "resume.pdf",
        mediaType: "application/pdf",
        dataBase64: Buffer.from("pdf-data").toString("base64"),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AppError);
    expect(thrown).toMatchObject({
      status: 503,
      message: expect.stringContaining(
        "could not accept this attached PDF file directly",
      ),
    });
    expect(
      designResumeService.replaceCurrentDesignResumeDocument,
    ).not.toHaveBeenCalled();
  });
});
