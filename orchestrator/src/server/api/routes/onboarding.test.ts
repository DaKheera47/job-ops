import type { Server } from "node:http";
import { RxResumeClient } from "@server/services/rxresume-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Onboarding API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;
  let originalFetch: typeof global.fetch;

  beforeEach(async () => {
    originalFetch = global.fetch;
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
    global.fetch = originalFetch;
  });

  describe("POST /api/onboarding/validate/openrouter", () => {
    it("returns invalid when no API key is provided and none in env", async () => {
      const res = await fetch(`${baseUrl}/api/onboarding/validate/openrouter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.valid).toBe(false);
      expect(body.data.message).toContain("missing");
    });

    it("returns invalid when API key is empty string", async () => {
      const res = await fetch(`${baseUrl}/api/onboarding/validate/openrouter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "   " }),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data.valid).toBe(false);
      expect(body.data.message).toContain("missing");
    });

    it("validates an invalid API key against OpenRouter", async () => {
      global.fetch = vi.fn((input, init) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("https://openrouter.ai/api/v1/key")) {
          return Promise.resolve({
            ok: false,
            status: 401,
            json: async () => ({ error: { message: "invalid api key" } }),
          } as Response);
        }
        return originalFetch(input, init);
      });
      const res = await fetch(`${baseUrl}/api/onboarding/validate/openrouter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "sk-or-invalid-key-12345" }),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      // Should be invalid because the key is fake
      expect(body.data.valid).toBe(false);
    });
  });

  describe("POST /api/onboarding/validate/rxresume", () => {
    it("returns invalid when no credentials are provided and none in env", async () => {
      const res = await fetch(`${baseUrl}/api/onboarding/validate/rxresume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.valid).toBe(false);
      expect(body.data.message).toContain("missing");
    });

    it("returns invalid when only email is provided", async () => {
      const res = await fetch(`${baseUrl}/api/onboarding/validate/rxresume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "test@example.com" }),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data.valid).toBe(false);
      expect(body.data.message).toContain("missing");
    });

    it("returns invalid when only password is provided", async () => {
      const res = await fetch(`${baseUrl}/api/onboarding/validate/rxresume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "testpass" }),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data.valid).toBe(false);
      expect(body.data.message).toContain("missing");
    });

    it("validates invalid credentials against RxResume", async () => {
      vi.spyOn(RxResumeClient, "verifyCredentials").mockResolvedValue({
        ok: false,
        status: 401,
        message: "InvalidCredentials",
      });
      const res = await fetch(`${baseUrl}/api/onboarding/validate/rxresume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent@test.com",
          password: "wrongpassword123",
        }),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      // Should be invalid because credentials are fake
      expect(body.data.valid).toBe(false);
    });

    it("handles whitespace-only credentials", async () => {
      const res = await fetch(`${baseUrl}/api/onboarding/validate/rxresume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "   ", password: "   " }),
      });
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.data.valid).toBe(false);
      expect(body.data.message).toContain("missing");
    });
  });

  describe("GET /api/onboarding/validate/resume", () => {
    it("returns invalid when rxresumeBaseResumeId is not configured", async () => {
      const res = await fetch(`${baseUrl}/api/onboarding/validate/resume`);
      const body = await res.json();

      expect(res.ok).toBe(true);
      expect(body.ok).toBe(true);
      expect(body.data.valid).toBe(false);
      expect(body.data.message).toContain("No base resume selected");
    });

    // Note: Further validation tests require mocking getSetting and getResume
    // which is complex in integration tests. The validation logic is covered
    // by unit tests in profile.test.ts and the service tests.
  });
});

/**
 * Creates a minimal valid RxResume v4 schema compliant JSON
 */
function _createMinimalValidResume() {
  return {
    basics: {
      name: "Test User",
      headline: "Software Developer",
      email: "test@example.com",
      phone: "",
      location: "",
      url: { label: "", href: "" },
      customFields: [],
      picture: {
        url: "",
        size: 64,
        aspectRatio: 1,
        borderRadius: 0,
        effects: { hidden: false, border: false, grayscale: false },
      },
    },
    sections: {
      summary: {
        id: "summary",
        name: "Summary",
        columns: 1,
        separateLinks: true,
        visible: true,
        content: "",
      },
      skills: {
        id: "skills",
        name: "Skills",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      awards: {
        id: "awards",
        name: "Awards",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      certifications: {
        id: "certifications",
        name: "Certifications",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      education: {
        id: "education",
        name: "Education",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      experience: {
        id: "experience",
        name: "Experience",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      volunteer: {
        id: "volunteer",
        name: "Volunteer",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      interests: {
        id: "interests",
        name: "Interests",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      languages: {
        id: "languages",
        name: "Languages",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      profiles: {
        id: "profiles",
        name: "Profiles",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      projects: {
        id: "projects",
        name: "Projects",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      publications: {
        id: "publications",
        name: "Publications",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      references: {
        id: "references",
        name: "References",
        columns: 1,
        separateLinks: true,
        visible: true,
        items: [],
      },
      custom: {},
    },
    metadata: {
      template: "rhyhorn",
      layout: [[["summary"], ["skills"]]],
      css: { value: "", visible: false },
      page: {
        margin: 18,
        format: "a4",
        options: { breakLine: true, pageNumbers: true },
      },
      theme: { background: "#ffffff", text: "#000000", primary: "#dc2626" },
      typography: {
        font: {
          family: "IBM Plex Serif",
          subset: "latin",
          variants: ["regular"],
          size: 14,
        },
        lineHeight: 1.5,
        hideIcons: false,
        underlineLinks: true,
      },
      notes: "",
    },
  };
}
