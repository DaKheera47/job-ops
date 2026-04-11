import { getSetting } from "@server/repositories/settings";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRxResumeResumeCache,
  exportResumePdf,
  getResume,
  importResume,
  listResumes,
  validateCredentials,
} from "./index";
import * as v5 from "./v5";

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("./v5", () => ({
  getResume: vi.fn(),
  listResumes: vi.fn(),
  importResume: vi.fn(),
  deleteResume: vi.fn(),
  exportResumePdf: vi.fn(),
  verifyApiKey: vi.fn(),
}));

describe("RxResume Service (index.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRxResumeResumeCache();

    // Default mocks
    vi.mocked(getSetting).mockImplementation(async (key) => {
      if (key === "rxresumeApiKey") return "test-api-key";
      if (key === "rxresumeUrl") return "https://rxresu.me";
      return null;
    });
  });

  describe("listResumes", () => {
    it("fetches resumes from v5 upstream", async () => {
      vi.mocked(v5.listResumes).mockResolvedValueOnce([
        { id: "1", name: "Resume 1", data: {} },
      ] as any);

      const result = await listResumes();

      expect(v5.listResumes).toHaveBeenCalledWith({
        apiKey: "test-api-key",
        baseUrl: "https://rxresu.me",
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("1");
      expect(result[0].name).toBe("Resume 1");
    });

    it("throws RxResumeAuthConfigError if no API key is configured", async () => {
      vi.mocked(getSetting).mockResolvedValue(null);

      await expect(listResumes()).rejects.toThrow(
        "Reactive Resume API key is not configured",
      );
    });
  });

  describe("getResume", () => {
    it("fetches a resume from v5 upstream and caches it", async () => {
      vi.mocked(v5.getResume).mockResolvedValueOnce({
        id: "1",
        name: "Resume 1",
        data: { basics: { name: "John" } },
      } as any);

      const result1 = await getResume("1");

      expect(v5.getResume).toHaveBeenCalledTimes(1);
      expect(result1.mode).toBe("v5");
      expect(result1.id).toBe("1");

      // Should be cached
      const result2 = await getResume("1");
      expect(v5.getResume).toHaveBeenCalledTimes(1); // Still 1
      expect(result2).toEqual(result1);
    });

    it("forces refresh when requested", async () => {
      vi.mocked(v5.getResume).mockResolvedValue({
        id: "1",
        name: "Resume 1",
        data: {},
      } as any);

      await getResume("1");
      expect(v5.getResume).toHaveBeenCalledTimes(1);

      await getResume("1", { forceRefresh: true });
      expect(v5.getResume).toHaveBeenCalledTimes(2);
    });

    it("expires cache after TTL and refetches", async () => {
      vi.useFakeTimers();

      vi.mocked(v5.getResume).mockResolvedValue({
        id: "1",
        name: "Resume 1",
        data: { basics: { name: "John" } },
      } as any);

      await getResume("1");
      expect(v5.getResume).toHaveBeenCalledTimes(1);

      // Advance time by 6 minutes (TTL is 5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      await getResume("1");
      expect(v5.getResume).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });

    it("coalesces in-flight requests", async () => {
      let resolveRequest: ((val: any) => void) | undefined;
      const requestPromise = new Promise((resolve) => {
        resolveRequest = resolve;
      });

      vi.mocked(v5.getResume).mockImplementation(() => requestPromise as any);

      // Fire multiple requests concurrently
      const promise1 = getResume("1");
      const promise2 = getResume("1");
      const promise3 = getResume("1");

      await new Promise((resolve) => setTimeout(resolve, 0));

      // Only one upstream request should be fired
      expect(v5.getResume).toHaveBeenCalledTimes(1);

      // Resolve the upstream request
      resolveRequest?.({
        id: "1",
        name: "Resume 1",
        data: { basics: { name: "John" } },
      });

      const [res1, res2, res3] = await Promise.all([
        promise1,
        promise2,
        promise3,
      ]);

      expect(res1).toEqual(res2);
      expect(res1).toEqual(res3);
      expect(v5.getResume).toHaveBeenCalledTimes(1);
    });
  });

  describe("importResume", () => {
    it("imports data using v5 upstream", async () => {
      vi.mocked(v5.importResume).mockResolvedValueOnce("new-resume-id");

      const result = await importResume({
        name: "My Import",
        data: { basics: {} },
      });

      expect(v5.importResume).toHaveBeenCalledWith(
        {
          name: "My Import",
          slug: "",
          data: { basics: {} },
        },
        {
          apiKey: "test-api-key",
          baseUrl: "https://rxresu.me",
        },
      );
      expect(result).toBe("new-resume-id");
    });
  });

  describe("exportResumePdf", () => {
    it("exports PDF using v5 upstream", async () => {
      vi.mocked(v5.exportResumePdf).mockResolvedValueOnce("https://pdf.url");

      const result = await exportResumePdf("resume-1");

      expect(v5.exportResumePdf).toHaveBeenCalledWith("resume-1", {
        apiKey: "test-api-key",
        baseUrl: "https://rxresu.me",
      });
      expect(result).toBe("https://pdf.url");
    });
  });

  describe("validateCredentials", () => {
    it("returns ok when v5 credentials are valid", async () => {
      vi.mocked(v5.verifyApiKey).mockResolvedValueOnce({
        ok: true,
        message: "Valid",
      } as any);

      const result = await validateCredentials();

      expect(v5.verifyApiKey).toHaveBeenCalledWith(
        "test-api-key",
        "https://rxresu.me",
      );
      expect(result).toEqual({ ok: true, mode: "v5" });
    });

    it("returns false with status when v5 credentials are invalid", async () => {
      vi.mocked(v5.verifyApiKey).mockResolvedValueOnce({
        ok: false,
        status: 401,
        message: "Unauthorized",
      } as any);

      const result = await validateCredentials();

      expect(result).toEqual({
        ok: false,
        mode: "v5",
        status: 401,
        message: "Unauthorized",
      });
    });

    it("handles missing API key gracefully", async () => {
      vi.mocked(getSetting).mockResolvedValue(null);

      const result = await validateCredentials();

      expect(result).toEqual({
        ok: false,
        mode: "v5",
        status: 400,
        message: expect.stringContaining("API key is not configured"),
      });
    });
  });
});
