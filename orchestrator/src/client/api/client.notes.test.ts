import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./client";

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as Response;
}

describe("job notes API client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.__resetApiClientAuthForTests();
  });

  it("fetches job notes with a cache-busting query param", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(200, {
        ok: true,
        data: [
          {
            id: "note-1",
            jobId: "job-1",
            title: "Why applied",
            content: "Because it fits.",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        meta: { requestId: "req-1" },
      }),
    );
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    await expect(api.getJobNotes("job-1")).resolves.toEqual([
      {
        id: "note-1",
        jobId: "job-1",
        title: "Why applied",
        content: "Because it fits.",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/jobs/job-1/notes?t=1700000000000",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("fetches job emails with limit and cache-busting query params", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(200, {
        ok: true,
        data: {
          items: [
            {
              message: {
                id: "msg-1",
                provider: "gmail",
                accountKey: "default",
                integrationId: "int-1",
                syncRunId: null,
                externalMessageId: "ext-1",
                externalThreadId: "thread-1",
                fromAddress: "jobs@example.com",
                fromDomain: "example.com",
                senderName: "Recruiting",
                subject: "Interview invite",
                receivedAt: 1_700_000_000_000,
                snippet: "Let's schedule",
                classificationLabel: "interview",
                classificationConfidence: 0.95,
                classificationPayload: null,
                relevanceLlmScore: 95,
                relevanceDecision: "relevant",
                matchedJobId: "job-1",
                matchConfidence: 95,
                stageTarget: "technical_interview",
                messageType: "interview",
                stageEventPayload: null,
                processingStatus: "auto_linked",
                decidedAt: null,
                decidedBy: null,
                errorCode: null,
                errorMessage: null,
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
              },
              sourceUrl: "https://mail.google.com/mail/u/0/#all/thread-1",
              accountDisplayName: "Work Gmail",
            },
          ],
          total: 1,
        },
        meta: { requestId: "req-emails" },
      }),
    );
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    await expect(api.getJobEmails("job-1", { limit: 50 })).resolves.toEqual({
      items: [
        {
          message: expect.objectContaining({
            id: "msg-1",
            subject: "Interview invite",
          }),
          sourceUrl: "https://mail.google.com/mail/u/0/#all/thread-1",
          accountDisplayName: "Work Gmail",
        },
      ],
      total: 1,
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/jobs/job-1/emails?t=1700000000000&limit=50",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("creates a job note with the provided markdown content", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(200, {
        ok: true,
        data: {
          id: "note-2",
          jobId: "job-1",
          title: "Recruiter contact",
          content: "- Alex\n- alex@example.com",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
        meta: { requestId: "req-2" },
      }),
    );

    await expect(
      api.createJobNote("job-1", {
        title: "Recruiter contact",
        content: "- Alex\n- alex@example.com",
      }),
    ).resolves.toEqual({
      id: "note-2",
      jobId: "job-1",
      title: "Recruiter contact",
      content: "- Alex\n- alex@example.com",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/jobs/job-1/notes",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "Recruiter contact",
          content: "- Alex\n- alex@example.com",
        }),
      }),
    );
  });

  it("updates a job note", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(200, {
        ok: true,
        data: {
          id: "note-2",
          jobId: "job-1",
          title: "Recruiter contact",
          content: "Updated note",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
        meta: { requestId: "req-3" },
      }),
    );

    await expect(
      api.updateJobNote("job-1", "note-2", {
        title: "Recruiter contact",
        content: "Updated note",
      }),
    ).resolves.toEqual({
      id: "note-2",
      jobId: "job-1",
      title: "Recruiter contact",
      content: "Updated note",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-03T00:00:00.000Z",
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/jobs/job-1/notes/note-2",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          title: "Recruiter contact",
          content: "Updated note",
        }),
      }),
    );
  });

  it("deletes a job note", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(200, {
        ok: true,
        data: null,
        meta: { requestId: "req-4" },
      }),
    );

    await expect(api.deleteJobNote("job-1", "note-2")).resolves.toBeUndefined();

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/jobs/job-1/notes/note-2",
      expect.objectContaining({
        method: "DELETE",
      }),
    );
  });
});
