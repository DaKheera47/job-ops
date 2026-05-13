import type { AppError } from "@infra/errors";
import { createJob } from "@shared/testing/factories";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildJobChatPromptContext } from "./ghostwriter-context";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    open: mocks.open,
  },
  open: mocks.open,
}));

vi.mock("../repositories/jobs", () => ({
  getJobById: vi.fn(),
  listJobNotesByIds: vi.fn(),
}));

vi.mock("../repositories/job-documents", () => ({
  listJobDocumentsByIds: vi.fn(),
}));

vi.mock("./post-application/job-emails", () => ({
  listJobPostApplicationEmailsByIds: vi.fn(),
}));

vi.mock("../repositories/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("./profile", () => ({
  getProfile: vi.fn(),
}));

vi.mock("./writing-style", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./writing-style")>();

  return {
    ...actual,
    getWritingStyle: vi.fn(),
  };
});

import { listJobDocumentsByIds } from "../repositories/job-documents";
import { getJobById, listJobNotesByIds } from "../repositories/jobs";
import { getSetting } from "../repositories/settings";
import { listJobPostApplicationEmailsByIds } from "./post-application/job-emails";
import { getProfile } from "./profile";
import { getWritingStyle } from "./writing-style";

function mockDocumentFile(buffer: Buffer) {
  const read = vi.fn(
    async (
      target: Buffer,
      offset: number,
      length: number,
      position: number,
    ) => {
      const start = position ?? 0;
      const bytesRead = buffer.copy(
        target,
        offset,
        start,
        Math.min(buffer.byteLength, start + length),
      );
      return { bytesRead, buffer: target };
    },
  );
  const close = vi.fn(async () => undefined);

  mocks.open.mockResolvedValue({ read, close });
  return { read, close };
}

describe("buildJobChatPromptContext", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listJobNotesByIds).mockResolvedValue([]);
    vi.mocked(listJobDocumentsByIds).mockResolvedValue([]);
    mockDocumentFile(Buffer.from(""));
    vi.mocked(listJobPostApplicationEmailsByIds).mockResolvedValue([]);
    vi.mocked(getSetting).mockResolvedValue(null);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "professional",
      formality: "medium",
      constraints: "",
      doNotUse: "",
      languageMode: "manual",
      manualLanguage: "english",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
  });

  it("builds context with style directives and snapshots", async () => {
    const job = createJob({
      id: "job-ctx-1",
      title: "Software Engineer",
      employer: "JP Morgan",
      jobDescription: "A".repeat(5000),
    });

    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "direct",
      formality: "high",
      constraints: "Keep responses under 120 words",
      doNotUse: "synergy, leverage",
      languageMode: "manual",
      manualLanguage: "german",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        name: "Test User",
        headline: "Full-stack engineer",
        summary: "I build production systems",
      },
      sections: {
        skills: {
          name: "Skills",
          visible: true,
          id: "skills-1",
          items: [
            {
              id: "skill-1",
              visible: true,
              name: "TypeScript",
              description: "",
              level: 4,
              keywords: ["Node.js", "React"],
            },
          ],
        },
      },
    });

    const context = await buildJobChatPromptContext(job.id);

    expect(context.style).toEqual({
      tone: "direct",
      formality: "high",
      constraints: "Keep responses under 120 words",
      doNotUse: "synergy, leverage",
      languageMode: "manual",
      manualLanguage: "german",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
    expect(context.systemPrompt).toContain("Writing style tone: direct.");
    expect(context.systemPrompt).toContain("Writing style formality: high.");
    expect(context.systemPrompt).toContain(
      "Follow the user's requested output language exactly when they specify one.",
    );
    expect(context.systemPrompt).toContain(
      "When the user does not request a language, default to writing user-visible resume or application content in German.",
    );
    expect(context.systemPrompt).toContain(
      "When suggesting a headline or job title, preserve the original wording instead of translating it.",
    );
    expect(context.systemPrompt).toContain(
      "Writing constraints: Keep responses under 120 words",
    );
    expect(context.systemPrompt).toContain(
      "Avoid these terms: synergy, leverage",
    );
    expect(context.jobSnapshot).toContain('"id": "job-ctx-1"');
    expect(context.jobSnapshot.length).toBeLessThan(6000);
    expect(context.profileSnapshot).toContain("Name: Test User");
    expect(context.profileSnapshot).toContain("Skills:");
  });

  it("falls back to empty profile snapshot when profile loading fails", async () => {
    const job = createJob({ id: "job-ctx-2" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockRejectedValue(new Error("profile unavailable"));

    const context = await buildJobChatPromptContext(job.id);

    expect(context.job.id).toBe("job-ctx-2");
    expect(context.profileSnapshot).toContain("Name: Unknown");
    expect(context.systemPrompt).toContain("Writing style tone: professional.");
  });

  it("matches Ghostwriter language to detected resume language when configured", async () => {
    const job = createJob({ id: "job-ctx-3" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "professional",
      formality: "medium",
      constraints: "",
      doNotUse: "",
      languageMode: "match-resume",
      manualLanguage: "english",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
    vi.mocked(getProfile).mockResolvedValue({
      basics: {
        name: "Claire",
        summary:
          "Je conçois des plateformes de données et je travaille avec des équipes produit et ingénierie.",
      },
      sections: {
        summary: {
          content:
            "Expérience en développement, livraison et accompagnement des équipes.",
        },
      },
    });

    const context = await buildJobChatPromptContext(job.id);

    expect(context.systemPrompt).toContain(
      "When the user does not request a language, default to writing user-visible resume or application content in French.",
    );
  });

  it("removes language instructions from global writing constraints", async () => {
    const job = createJob({ id: "job-ctx-4" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getWritingStyle).mockResolvedValue({
      tone: "professional",
      formality: "medium",
      constraints: "Always respond in French. Keep responses under 120 words.",
      doNotUse: "",
      languageMode: "manual",
      manualLanguage: "english",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
    vi.mocked(getProfile).mockResolvedValue({});

    const context = await buildJobChatPromptContext(job.id);

    expect(context.systemPrompt).toContain(
      "When the user does not request a language, default to writing user-visible resume or application content in English.",
    );
    expect(context.systemPrompt).toContain(
      "Writing constraints: Keep responses under 120 words",
    );
    expect(context.systemPrompt).not.toContain("Always respond in French");
  });

  it("uses a stored Ghostwriter prompt template override", async () => {
    const job = createJob({ id: "job-ctx-5" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(getSetting).mockImplementation(async (key) =>
      key === "ghostwriterSystemPromptTemplate"
        ? "Custom Ghostwriter {{tone}} {{unknownToken}}"
        : null,
    );

    const context = await buildJobChatPromptContext(job.id);

    expect(context.systemPrompt).toContain("Custom Ghostwriter professional");
    expect(context.systemPrompt).toContain("{{unknownToken}}");
  });

  it("adds Stop Slop instructions when enabled", async () => {
    const job = createJob({ id: "job-ctx-stop-slop" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(getSetting).mockImplementation(async (key) =>
      key === "ghostwriterStopSlopEnabled" ? "1" : null,
    );

    const context = await buildJobChatPromptContext(job.id);

    expect(context.systemPrompt).toContain(
      "Stop Slop revision rules for Ghostwriter prose",
    );
    expect(context.systemPrompt).toContain("Avoid formulaic structures");
  });

  it("builds selected job notes context with shared truncation limits", async () => {
    const job = createJob({ id: "job-ctx-notes" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(listJobNotesByIds).mockResolvedValue([
      {
        id: "note-2",
        jobId: job.id,
        title: "Not selected",
        content: "Skip me",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "note-1",
        jobId: job.id,
        title: "Interview transcript",
        content: "A".repeat(3500),
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);

    const context = await buildJobChatPromptContext(job.id, ["note-1"]);

    expect(listJobNotesByIds).toHaveBeenCalledWith(job.id, ["note-1"]);
    expect(context.selectedNotesSnapshot).toContain("Selected Job Notes:");
    expect(context.selectedNotesSnapshot).toContain(
      "Note 1: Interview transcript",
    );
    expect(context.selectedNotesSnapshot).toContain(
      "Context note: trimmed for AI context limits.",
    );
    expect(context.selectedNotesSnapshot).not.toContain("Not selected");
    expect(context.selectedNotesSnapshot).not.toContain("A".repeat(3501));
  });

  it("builds selected job emails context with shared truncation limits", async () => {
    const job = createJob({ id: "job-ctx-emails" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(listJobPostApplicationEmailsByIds).mockResolvedValue([
      {
        message: {
          id: "email-2",
          provider: "gmail",
          accountKey: "default",
          integrationId: null,
          syncRunId: null,
          externalMessageId: "gmail-2",
          externalThreadId: "thread-2",
          fromAddress: "skip@example.com",
          fromDomain: "example.com",
          senderName: "Skip",
          subject: "Not selected",
          receivedAt: 1_767_225_600_000,
          snippet: "Skip me",
          classificationLabel: null,
          classificationConfidence: null,
          classificationPayload: null,
          relevanceLlmScore: null,
          relevanceDecision: "relevant",
          matchedJobId: job.id,
          matchConfidence: 80,
          stageTarget: "no_change",
          messageType: "other",
          stageEventPayload: null,
          processingStatus: "auto_linked",
          decidedAt: null,
          decidedBy: null,
          errorCode: null,
          errorMessage: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        accountDisplayName: "Work Gmail",
        sourceUrl: null,
      },
      {
        message: {
          id: "email-1",
          provider: "gmail",
          accountKey: "default",
          integrationId: null,
          syncRunId: null,
          externalMessageId: "gmail-1",
          externalThreadId: "thread-1",
          fromAddress: "recruiter@example.com",
          fromDomain: "example.com",
          senderName: "Recruiter",
          subject: "Interview update",
          receivedAt: 1_767_225_600_000,
          snippet: "A".repeat(1300),
          classificationLabel: null,
          classificationConfidence: null,
          classificationPayload: null,
          relevanceLlmScore: null,
          relevanceDecision: "relevant",
          matchedJobId: job.id,
          matchConfidence: 91,
          stageTarget: "recruiter_screen",
          messageType: "interview",
          stageEventPayload: null,
          processingStatus: "auto_linked",
          decidedAt: null,
          decidedBy: null,
          errorCode: null,
          errorMessage: null,
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
        accountDisplayName: "Work Gmail",
        sourceUrl: "https://mail.google.com/mail/u/0/#all/thread-1",
      },
    ]);

    const context = await buildJobChatPromptContext(job.id, [], ["email-1"]);

    expect(listJobPostApplicationEmailsByIds).toHaveBeenCalledWith(job.id, [
      "email-1",
    ]);
    expect(context.selectedEmailsSnapshot).toContain("Selected Job Emails:");
    expect(context.selectedEmailsSnapshot).toContain(
      "Email 1: Interview update",
    );
    expect(context.selectedEmailsSnapshot).toContain("Sender: Recruiter");
    expect(context.selectedEmailsSnapshot).toContain(
      "Context note: snippet trimmed for AI context limits.",
    );
    expect(context.selectedEmailsSnapshot).not.toContain("Account:");
    expect(context.selectedEmailsSnapshot).not.toContain("Source URL:");
    expect(context.selectedEmailsSnapshot).not.toContain("Work Gmail");
    expect(context.selectedEmailsSnapshot).not.toContain("mail.google.com");
    expect(context.selectedEmailsSnapshot).not.toContain("Not selected");
    expect(context.selectedEmailsSnapshot).not.toContain("A".repeat(1301));
  });

  it("builds selected job documents context with shared truncation limits", async () => {
    const job = createJob({ id: "job-ctx-documents" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(listJobDocumentsByIds).mockResolvedValue([
      {
        id: "doc-2",
        jobId: job.id,
        fileName: "skip.txt",
        mediaType: "text/plain",
        byteSize: 7,
        storagePath: "/tmp/skip.txt",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "doc-1",
        jobId: job.id,
        fileName: "take-home.md",
        mediaType: "text/markdown",
        byteSize: 7000,
        storagePath: "/tmp/take-home.md",
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    mockDocumentFile(Buffer.from("A".repeat(7000)));

    const context = await buildJobChatPromptContext(job.id, [], [], ["doc-1"]);

    expect(listJobDocumentsByIds).toHaveBeenCalledWith(job.id, ["doc-1"]);
    expect(mocks.open).toHaveBeenCalledWith("/tmp/take-home.md", "r");
    expect(context.selectedDocumentsSnapshot).toContain(
      "Selected Job Documents:",
    );
    expect(context.selectedDocumentsSnapshot).toContain(
      "Document 1: take-home.md",
    );
    expect(context.selectedDocumentsSnapshot).toContain(
      "Context note: document text trimmed for AI context limits.",
    );
    expect(context.selectedDocumentsSnapshot).not.toContain("skip.txt");
    expect(context.selectedDocumentsSnapshot).not.toContain("A".repeat(6001));
  });

  it("extracts DOCX documents for selected job document context", async () => {
    const job = createJob({ id: "job-ctx-docx" });
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      `
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:body>
            <w:p><w:r><w:t>Interview pack</w:t></w:r></w:p>
            <w:p><w:r><w:t>Discuss reliability &amp; incident response.</w:t></w:r></w:p>
          </w:body>
        </w:document>
      `,
    );

    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(listJobDocumentsByIds).mockResolvedValue([
      {
        id: "doc-docx",
        jobId: job.id,
        fileName: "interview-pack.docx",
        mediaType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteSize: 2048,
        storagePath: "/tmp/interview-pack.docx",
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    mockDocumentFile(await zip.generateAsync({ type: "nodebuffer" }));

    const context = await buildJobChatPromptContext(
      job.id,
      [],
      [],
      ["doc-docx"],
    );

    expect(context.selectedDocumentsSnapshot).toContain(
      "Document 1: interview-pack.docx",
    );
    expect(context.selectedDocumentsSnapshot).toContain("Interview pack");
    expect(context.selectedDocumentsSnapshot).toContain(
      "Discuss reliability & incident response.",
    );
  });

  it("reads only the configured document prefix for Ghostwriter context", async () => {
    const job = createJob({ id: "job-ctx-document-prefix" });
    vi.mocked(getJobById).mockResolvedValue(job);
    vi.mocked(getProfile).mockResolvedValue({});
    vi.mocked(listJobDocumentsByIds).mockResolvedValue([
      {
        id: "doc-large",
        jobId: job.id,
        fileName: "large.txt",
        mediaType: "text/plain",
        byteSize: 10 * 1024 * 1024,
        storagePath: "/tmp/large.txt",
        createdAt: "2026-01-02T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    const { read, close } = mockDocumentFile(Buffer.from("A".repeat(7000)));

    await buildJobChatPromptContext(job.id, [], [], ["doc-large"]);

    expect(mocks.open).toHaveBeenCalledWith("/tmp/large.txt", "r");
    expect(read).toHaveBeenCalledWith(
      expect.any(Buffer),
      0,
      2 * 1024 * 1024,
      0,
    );
    expect(close).toHaveBeenCalled();
  });

  it("throws not found for unknown job", async () => {
    vi.mocked(getJobById).mockResolvedValue(null);

    await expect(
      buildJobChatPromptContext("missing-job"),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    } satisfies Partial<AppError>);
  });
});
