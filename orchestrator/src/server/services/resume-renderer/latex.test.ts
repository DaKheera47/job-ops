import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getLatexTemplatePath,
  getTectonicBinary,
  readLatexTemplate,
  renderLatexPdf,
} from "./latex";
import type { LatexResumeDocument } from "./types";

const baseDocument: LatexResumeDocument = {
  name: "Jane Doe",
  headline: "Senior Software Engineer",
  contactItems: [
    { text: "jane@example.com", url: "mailto:jane@example.com" },
    { text: "Portfolio", url: "https://jane.dev" },
  ],
  summary: "Builds resilient platform systems.",
  experience: [
    {
      title: "Acme",
      subtitle: "Platform Engineer | Remote",
      date: "2023 -- Present",
      bullets: ["Improved API reliability", "Reduced operator toil"],
      url: "https://acme.example.com",
      linkLabel: "Acme",
    },
  ],
  education: [],
  projects: [],
  skillGroups: [
    {
      name: "Backend",
      keywords: ["TypeScript", "Node.js", "PostgreSQL"],
    },
  ],
};

async function createTempDir(): Promise<string> {
  return await mkdtemp(join(tmpdir(), "job-ops-latex-render-test-"));
}

function tectonicAvailable(): boolean {
  const binary = process.env.TECTONIC_BIN?.trim() || "tectonic";
  const result = spawnSync(binary, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

describe("latex resume renderer", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dir) => {
        await rm(dir, { recursive: true, force: true });
      }),
    );
  });

  it("exposes the bundled Jake template", async () => {
    expect(getLatexTemplatePath()).toContain("jake-resume.tex");
    const template = await readLatexTemplate();
    expect(template).toContain("Resume in Latex");
    expect(template).toContain("__BODY__");
  });

  it("uses the TECTONIC_BIN override when present", () => {
    const previous = process.env.TECTONIC_BIN;
    process.env.TECTONIC_BIN = "/tmp/custom-tectonic";
    expect(getTectonicBinary()).toBe("/tmp/custom-tectonic");
    if (previous === undefined) {
      delete process.env.TECTONIC_BIN;
    } else {
      process.env.TECTONIC_BIN = previous;
    }
  });

  it("fails with a helpful error when tectonic is unavailable", async () => {
    const previous = process.env.TECTONIC_BIN;
    process.env.TECTONIC_BIN = "/definitely/missing/tectonic";
    const tempDir = await createTempDir();
    tempDirs.push(tempDir);
    const outputPath = join(tempDir, "resume.pdf");

    await expect(
      renderLatexPdf({
        document: baseDocument,
        outputPath,
        jobId: "job-missing-tectonic",
      }),
    ).rejects.toThrow(/Tectonic binary not found/i);

    if (previous === undefined) {
      delete process.env.TECTONIC_BIN;
    } else {
      process.env.TECTONIC_BIN = previous;
    }
  });

  it.skipIf(!tectonicAvailable())(
    "renders a PDF when tectonic is installed",
    async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);
      const outputPath = join(tempDir, "resume.pdf");

      await renderLatexPdf({
        document: baseDocument,
        outputPath,
        jobId: "job-render-success",
      });

      const stats = spawnSync("sh", ["-lc", `test -s "${outputPath}"`], {
        stdio: "ignore",
      });
      expect(stats.status).toBe(0);
    },
  );
});
