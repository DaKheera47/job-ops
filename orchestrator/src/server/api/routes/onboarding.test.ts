import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

vi.mock("@server/services/onboarding-search-terms", () => ({
  suggestOnboardingSearchTerms: vi.fn(),
}));

import { suggestOnboardingSearchTerms } from "@server/services/onboarding-search-terms";

describe.sequential("Onboarding API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  describe("POST /api/onboarding/search-terms/suggest", () => {
    it("returns AI-generated terms in the standard API wrapper", async () => {
      vi.mocked(suggestOnboardingSearchTerms).mockResolvedValue({
        terms: ["Platform Engineer", "Backend Engineer"],
        source: "ai",
      });

      const res = await fetch(
        `${baseUrl}/api/onboarding/search-terms/suggest`,
        {
          method: "POST",
        },
      );
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body).toMatchObject({
        ok: true,
        data: {
          terms: ["Platform Engineer", "Backend Engineer"],
          source: "ai",
        },
        meta: {
          requestId: expect.any(String),
        },
      });
    });

    it("returns a conflict response when no usable resume is configured", async () => {
      const { AppError } = await import("@infra/errors");
      vi.mocked(suggestOnboardingSearchTerms).mockRejectedValue(
        new AppError({
          status: 409,
          code: "CONFLICT",
          message: "Resume must be configured before suggesting search terms.",
        }),
      );

      const res = await fetch(
        `${baseUrl}/api/onboarding/search-terms/suggest`,
        {
          method: "POST",
        },
      );
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body).toMatchObject({
        ok: false,
        error: {
          code: "CONFLICT",
          message: "Resume must be configured before suggesting search terms.",
        },
        meta: {
          requestId: expect.any(String),
        },
      });
    });
  });
});
