import type { DesignResumeDocument, DesignResumeJson } from "@shared/types";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultReactiveResumeDocument } from "../rxresume/document";

const modelSelection = vi.hoisted(() => ({
  resolveLlmRuntimeSettings: vi.fn(),
}));

const designResumeService = vi.hoisted(() => ({
  replaceCurrentDesignResumeDocument: vi.fn(),
}));

const requestContext = vi.hoisted(() => ({
  getRequestContext: vi.fn(() => ({ requestId: "req-123" })),
  getRequestId: vi.fn(() => "req-123"),
}));

vi.mock("@server/services/modelSelection", () => modelSelection);
vi.mock("./index", () => designResumeService);
vi.mock("@server/infra/request-context", () => requestContext);
vi.mock("pdf-parse", () => ({
  default: vi.fn(),
}));

import pdfParse from "pdf-parse";
import { importDesignResumeFromFile } from "./import-file";

function makePdfParseResult(text: string) {
  return {
    numpages: 1,
    numrender: 1,
    info: {},
    metadata: null,
    version: "default" as const,
    text,
  };
}

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

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function makeDocxBase64(text: string): Promise<string> {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${escapeXml(text)}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`,
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return buffer.toString("base64");
}

describe("importDesignResumeFromFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(pdfParse).mockResolvedValue(
      makePdfParseResult("Taylor Quinn\nSenior Engineer"),
    );
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

  it("imports Reactive Resume JSON directly without model extraction", async () => {
    const resumeJson = buildDefaultReactiveResumeDocument() as DesignResumeJson;
    resumeJson.basics.name = "Jordan Park";

    const result = await importDesignResumeFromFile({
      fileName: "resume.json",
      mediaType: "application/json",
      dataBase64: Buffer.from(JSON.stringify(resumeJson), "utf8").toString(
        "base64",
      ),
    });

    expect(modelSelection.resolveLlmRuntimeSettings).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(
      designResumeService.replaceCurrentDesignResumeDocument,
    ).toHaveBeenCalledWith({
      importedAt: expect.any(String),
      resumeJson: expect.objectContaining({
        basics: expect.objectContaining({ name: "Jordan Park" }),
      }),
      sourceMode: "v5",
      sourceResumeId: null,
    });
    expect(result.resumeJson.basics.name).toBe("Jordan Park");
  });

  it("accepts data-wrapped Reactive Resume JSON exports", async () => {
    const resumeJson = buildDefaultReactiveResumeDocument() as DesignResumeJson;
    resumeJson.basics.name = "Sam Rivera";

    const result = await importDesignResumeFromFile({
      fileName: "resume.json",
      mediaType: "",
      dataBase64: Buffer.from(
        JSON.stringify({ data: resumeJson }),
        "utf8",
      ).toString("base64"),
    });

    expect(result.resumeJson.basics.name).toBe("Sam Rivera");
    expect(
      designResumeService.replaceCurrentDesignResumeDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMode: "v5",
        sourceResumeId: null,
      }),
    );
  });

  it("rejects non Reactive Resume JSON files", async () => {
    await expect(
      importDesignResumeFromFile({
        fileName: "not-a-resume.json",
        mediaType: "application/json",
        dataBase64: Buffer.from(
          JSON.stringify({ hello: "world" }),
          "utf8",
        ).toString("base64"),
      }),
    ).rejects.toMatchObject({
      status: 400,
      message:
        "Reactive Resume JSON must contain a v5 resume document or a data-wrapped v5 resume document.",
    });

    expect(
      designResumeService.replaceCurrentDesignResumeDocument,
    ).not.toHaveBeenCalled();
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

  it("extracts DOCX text locally before sending it to Gemini", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "gemini",
      model: "google/gemini-3-flash-preview",
      baseUrl: null,
      apiKey: "gemini-test",
    });

    const docxBase64 = await makeDocxBase64("Taylor Quinn\nSenior Engineer");

    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"basics":{"name":"Taylor Quinn"}}' }],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await importDesignResumeFromFile({
      fileName: "resume.docx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      dataBase64: docxBase64,
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent",
      ),
      expect.any(Object),
    );

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body =
      fetchCall?.[1] && "body" in fetchCall[1] ? fetchCall[1].body : "";
    const parsedBody = JSON.parse(String(body)) as Record<string, unknown>;

    expect(JSON.stringify(parsedBody)).not.toContain("inlineData");
    expect(JSON.stringify(parsedBody)).not.toContain("input_file");

    const contents = parsedBody.contents as Array<{
      parts?: Array<{ text?: string }>;
    }>;
    expect(contents[0]?.parts?.[0]?.text).toContain(
      "The resume file was uploaded as DOCX",
    );
    expect(contents[0]?.parts?.[0]?.text).toContain("Taylor Quinn");
    expect(contents[0]?.parts?.[0]?.text).toContain("Senior Engineer");
  });

  it("repairs Gemini JSON with unescaped quotes inside description fields", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      baseUrl: null,
      apiKey: "gemini-test",
    });

    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: `{"basics":{"name":"Taylor Quinn"},"sections":{"experience":{"items":[{"company":"Acme","position":"Engineer","description":"<ul><li>Led the "Employer Line" program.</li></ul>"}]}}}`,
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("pdf-data").toString("base64"),
    });

    const savedInput =
      designResumeService.replaceCurrentDesignResumeDocument.mock.calls[0]?.[0];
    const experienceItems =
      savedInput?.resumeJson?.sections?.experience?.items ?? [];

    expect(experienceItems).toHaveLength(1);
    expect(experienceItems[0]).toMatchObject({
      company: "Acme",
      position: "Engineer",
      description: '<ul><li>Led the "Employer Line" program.</li></ul>',
    });
  });

  it("ignores Gemini thought parts when extracting resume JSON", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "gemini",
      model: "gemini-2.5-flash-lite",
      baseUrl: null,
      apiKey: "gemini-test",
    });

    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    thought: true,
                    text: 'I should return {"not":"this"}',
                  },
                  {
                    text: '{"basics":{"name":"Taylor Quinn"}}',
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("pdf-data").toString("base64"),
    });

    expect(
      designResumeService.replaceCurrentDesignResumeDocument,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeJson: expect.objectContaining({
          basics: expect.objectContaining({ name: "Taylor Quinn" }),
        }),
      }),
    );
  });

  it("accepts supported media types even when the file name has no extension", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: `{"basics":{"name":"Taylor Quinn"}}`,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await importDesignResumeFromFile({
      fileName: "resume",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("pdf-data").toString("base64"),
    });

    expect(result.title).toBe("Taylor Resume");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("accepts hyphenated OpenRouter provider names", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "open-router",
      model: "openai/gpt-4.1",
      baseUrl: null,
      apiKey: "or-test",
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `{"basics":{"name":"Taylor Quinn"}}`,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("pdf-data").toString("base64"),
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.any(Object),
    );
  });

  it("uses the OpenRouter PDF parser instead of requiring native file input", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "openrouter",
      model: "google/gemini-3-flash-preview",
      baseUrl: null,
      apiKey: "or-test",
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `{"basics":{"name":"Taylor Quinn"}}`,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("pdf-data").toString("base64"),
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body =
      fetchCall?.[1] && "body" in fetchCall[1] ? fetchCall[1].body : "";
    expect(String(body)).toContain('"engine":"cloudflare-ai"');
    expect(String(body)).not.toContain('"engine":"native"');
  });

  it("retries OpenRouter PDF extraction with a fallback parser engine", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "openrouter",
      model: "google/gemini-3-flash-preview",
      baseUrl: null,
      apiKey: "or-test",
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: "PDF parser could not process this document.",
            },
          }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `{"basics":{"name":"Taylor Quinn"}}`,
                },
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("pdf-data").toString("base64"),
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(fetch).mock.calls[0];
    const secondCall = vi.mocked(fetch).mock.calls[1];
    const firstInit = firstCall?.[1];
    const secondInit = secondCall?.[1];
    const firstBody =
      firstInit && "body" in firstInit ? String(firstInit.body) : "";
    const secondBody =
      secondInit && "body" in secondInit ? String(secondInit.body) : "";

    expect(firstBody).toContain('"engine":"cloudflare-ai"');
    expect(secondBody).toContain('"engine":"mistral-ocr"');
  });

  it("allows a base64 payload exactly at the 10 MB limit", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: `{"basics":{"name":"Taylor Quinn"}}`,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const exactLimitPayload = Buffer.alloc(10 * 1024 * 1024, 0);

    await expect(
      importDesignResumeFromFile({
        fileName: "resume.pdf",
        mediaType: "application/pdf",
        dataBase64: exactLimitPayload.toString("base64"),
      }),
    ).resolves.toMatchObject({
      id: "primary",
    });
  });

  it("rejects invalid base64 payloads before sending them upstream", async () => {
    await expect(
      importDesignResumeFromFile({
        fileName: "resume.pdf",
        mediaType: "application/pdf",
        dataBase64: "not-valid-base64!!!",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Resume file data must be valid base64.",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(
      designResumeService.replaceCurrentDesignResumeDocument,
    ).not.toHaveBeenCalled();
  });

  it("sends normalized base64 upstream after stripping whitespace", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text: `{"basics":{"name":"Taylor Quinn"}}`,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const compactBase64 = Buffer.from("pdf-data").toString("base64");
    const spacedBase64 = `${compactBase64.slice(0, 4)}\n${compactBase64.slice(4)}  `;

    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: spacedBase64,
    });

    const fetchCall = vi.mocked(fetch).mock.calls[0];
    expect(fetchCall).toBeDefined();
    const body =
      fetchCall?.[1] && "body" in fetchCall[1] ? fetchCall[1].body : "";
    expect(String(body)).toContain(compactBase64);
    expect(String(body)).not.toContain(spacedBase64.trim());
  });

  it("imports PDFs through extracted text for Ollama", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "ollama",
      model: "llama3",
      baseUrl: "http://localhost:11434",
      apiKey: null,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `{"basics":{"name":"Taylor Quinn"}}`,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("pdf-data").toString("base64"),
    });

    expect(pdfParse).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
      }),
    );
    const fetchCall = vi.mocked(fetch).mock.calls[0];
    const body =
      fetchCall?.[1] && "body" in fetchCall[1] ? fetchCall[1].body : "";
    expect(String(body)).toContain(
      "The resume file was uploaded as PDF and converted locally to plain text before extraction.",
    );
    expect(String(body)).toContain("Taylor Quinn");
  });

  it("imports PDFs through extracted text for OpenAI-compatible endpoints", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "openai_compatible",
      model: "mistral:7b",
      baseUrl: "http://localhost:11434/v1/chat/completions",
      apiKey: null,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `{"basics":{"name":"Taylor Quinn"}}`,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("pdf-data").toString("base64"),
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Taylor Quinn"),
      }),
    );
  });

  it("imports DOCX through extracted text for OpenAI-compatible endpoints", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "openai_compatible",
      model: "gemma3:4b",
      baseUrl: "http://localhost:11434",
      apiKey: null,
    });
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: `{"basics":{"name":"Taylor Quinn"}}`,
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    const docxBase64 = await makeDocxBase64("Taylor Quinn\nSenior Engineer");

    await importDesignResumeFromFile({
      fileName: "resume.docx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      dataBase64: docxBase64,
    });

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:11434/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining(
          "The resume file was uploaded as DOCX and converted locally to plain text before extraction.",
        ),
      }),
    );
  });

  it("falls back to extracted PDF text when native file input is unsupported", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
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
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            output_text: `{"basics":{"name":"Taylor Quinn"}}`,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    await importDesignResumeFromFile({
      fileName: "resume.pdf",
      mediaType: "application/pdf",
      dataBase64: Buffer.from("pdf-data").toString("base64"),
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    const secondCall = vi.mocked(fetch).mock.calls[1];
    const secondBody =
      secondCall?.[1] && "body" in secondCall[1] ? secondCall[1].body : "";
    expect(String(secondBody)).not.toContain('"type":"input_file"');
    expect(String(secondBody)).toContain(
      "The resume file was uploaded as PDF and converted locally to plain text before extraction.",
    );
    expect(String(secondBody)).toContain("Taylor Quinn");
  });

  it("returns a clear error for PDFs without readable text during text fallback", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "ollama",
      model: "llama3",
      baseUrl: "http://localhost:11434",
      apiKey: null,
    });
    vi.mocked(pdfParse).mockResolvedValueOnce(makePdfParseResult("   "));

    await expect(
      importDesignResumeFromFile({
        fileName: "resume.pdf",
        mediaType: "application/pdf",
        dataBase64: Buffer.from("pdf-data").toString("base64"),
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Resume PDF did not contain readable text.",
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(
      designResumeService.replaceCurrentDesignResumeDocument,
    ).not.toHaveBeenCalled();
  });

  it("returns a capability error when the configured provider is unsupported", async () => {
    modelSelection.resolveLlmRuntimeSettings.mockResolvedValueOnce({
      provider: "codex",
      model: "gpt-5",
      baseUrl: null,
      apiKey: null,
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

  it("does not misclassify unrelated upstream errors as file capability failures", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Unable to load profile for this request.",
          },
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    await expect(
      importDesignResumeFromFile({
        fileName: "resume.pdf",
        mediaType: "application/pdf",
        dataBase64: Buffer.from("pdf-data").toString("base64"),
      }),
    ).rejects.toMatchObject({
      status: 502,
      message: "Unable to load profile for this request.",
    });
  });
});
