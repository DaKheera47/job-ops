import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  DEMO_BASELINE_NAME,
  DEMO_BASELINE_VERSION,
} from "@server/config/demo-defaults";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

const pdfMocks = vi.hoisted(() => ({
  generatePdf: vi.fn(),
}));

vi.mock("@server/services/pdf", async () => {
  const actual = await vi.importActual<typeof import("@server/services/pdf")>(
    "@server/services/pdf",
  );
  return {
    ...actual,
    generatePdf: pdfMocks.generatePdf,
  };
});

describe.sequential("Demo mode API behavior", () => {
  beforeEach(() => {
    pdfMocks.generatePdf.mockImplementation(async (jobId: string) => {
      const { getTenantJobPdfPath } = await import(
        "@server/services/pdf-storage"
      );
      const pdfPath = getTenantJobPdfPath(jobId);
      await mkdir(dirname(pdfPath), { recursive: true });
      await writeFile(pdfPath, Buffer.from("%PDF-1.4\nDemo PDF\n%%EOF\n"));
      return { success: true, pdfPath };
    });
  });

  it("returns demo info when demo mode is disabled", async () => {
    const { server, baseUrl, closeDb, tempDir } = await startServer();
    try {
      const response = await fetch(`${baseUrl}/api/demo/info`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.data.demoMode).toBe(false);
      expect(body.data.resetCadenceHours).toBe(6);
      expect(body.data.baselineVersion).toBe(null);
      expect(body.data.baselineName).toBe(null);
    } finally {
      await stopServer({ server, closeDb, tempDir });
    }
  });

  it("returns demo info when demo mode is enabled", async () => {
    const { server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        DEMO_MODE: "true",
        BASIC_AUTH_USER: "",
        BASIC_AUTH_PASSWORD: "",
      },
    });
    try {
      const response = await fetch(`${baseUrl}/api/demo/info`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.data.demoMode).toBe(true);
      expect(body.data.resetCadenceHours).toBe(6);
      expect(body.data.baselineVersion).toBe(DEMO_BASELINE_VERSION);
      expect(body.data.baselineName).toBe(DEMO_BASELINE_NAME);
    } finally {
      await stopServer({ server, closeDb, tempDir });
    }
  });

  it("simulates pipeline runs in demo mode", async () => {
    const { server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        DEMO_MODE: "true",
        JOBOPS_TEST_AUTH_BYPASS: "0",
        BASIC_AUTH_USER: "",
        BASIC_AUTH_PASSWORD: "",
      },
    });
    try {
      const response = await fetch(`${baseUrl}/api/pipeline/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sources: ["linkedin"] }),
      });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
      expect(body.meta?.simulated).toBe(true);
      expect(body.data.message).toContain("simulated");
    } finally {
      await stopServer({ server, closeDb, tempDir });
    }
  });

  it("blocks settings writes in demo mode with blocked reason metadata", async () => {
    const { server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        DEMO_MODE: "true",
        JOBOPS_TEST_AUTH_BYPASS: "0",
        BASIC_AUTH_USER: "",
        BASIC_AUTH_PASSWORD: "",
      },
    });
    try {
      const response = await fetch(`${baseUrl}/api/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmProvider: "openrouter" }),
      });
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(typeof body.meta?.blockedReason).toBe("string");
      expect(body.meta?.blockedReason).toContain("disabled");
    } finally {
      await stopServer({ server, closeDb, tempDir });
    }
  });

  it("simulates apply in demo mode", async () => {
    const { server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        DEMO_MODE: "true",
        JOBOPS_TEST_AUTH_BYPASS: "0",
      },
    });

    try {
      const imported = await fetch(`${baseUrl}/api/manual-jobs/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: {
            title: "Demo Imported Job",
            employer: "Demo Corp",
            jobDescription: "Demo description",
            jobUrl: "https://demo.job-ops.local/jobs/imported",
          },
        }),
      });
      const importedBody = await imported.json();
      expect(importedBody.ok).toBe(true);
      const jobId = importedBody.data.id as string;

      const response = await fetch(`${baseUrl}/api/jobs/${jobId}/apply`, {
        method: "POST",
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.meta?.simulated).toBe(true);
      expect(body.data.status).toBe("applied");
    } finally {
      await stopServer({ server, closeDb, tempDir });
    }
  });

  it("simulates PDF generation with a current demo artifact", async () => {
    const { server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        DEMO_MODE: "true",
        JOBOPS_TEST_AUTH_BYPASS: "0",
      },
    });

    try {
      const imported = await fetch(`${baseUrl}/api/manual-jobs/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: {
            title: "Demo Imported Job",
            employer: "Demo Corp",
            jobDescription: "Demo description",
            jobUrl: "https://demo.job-ops.local/jobs/imported-pdf",
          },
        }),
      });
      const importedBody = await imported.json();
      expect(importedBody.ok).toBe(true);
      const jobId = importedBody.data.id as string;

      const response = await fetch(
        `${baseUrl}/api/jobs/${jobId}/generate-pdf`,
        {
          method: "POST",
        },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.meta?.simulated).toBe(true);
      expect(body.data.status).toBe("ready");
      expect(body.data.pdfSource).toBe("generated");
      expect(body.data.pdfFreshness).toBe("current");
      expect(body.data.pdfPath).toContain(`resume_${jobId}.pdf`);

      const pdfResponse = await fetch(`${baseUrl}/api/jobs/${jobId}/pdf`);
      expect(pdfResponse.status).toBe(200);
      expect(pdfResponse.headers.get("content-type")).toContain(
        "application/pdf",
      );
      const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer());
      expect(pdfBytes.subarray(0, 5).toString()).toBe("%PDF-");
    } finally {
      await stopServer({ server, closeDb, tempDir });
    }
  });

  it("keeps sensitive demo auth surfaces protected", async () => {
    const { server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        DEMO_MODE: "true",
        JOBOPS_TEST_AUTH_BYPASS: "0",
        BASIC_AUTH_USER: "",
        BASIC_AUTH_PASSWORD: "",
      },
    });

    try {
      const response = await fetch(`${baseUrl}/api/auth/me`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    } finally {
      await stopServer({ server, closeDb, tempDir });
    }
  });
});
