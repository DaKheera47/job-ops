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
