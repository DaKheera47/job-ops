import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LatexResumeDocument } from "./types";
import {
  buildTypstDocument,
  getTypstBinary,
  getTypstTemplatePath,
  readTypstTemplate,
  renderTypstPdf,
} from "./typst";

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
  return await mkdtemp(join(tmpdir(), "job-ops-typst-render-test-"));
}

function typstAvailable(): boolean {
  const binary = process.env.TYPST_BIN?.trim() || "typst";
  const result = spawnSync(binary, ["--version"], { stdio: "ignore" });
  return result.status === 0;
}

describe("typst resume renderer", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(async (dir) => {
        await rm(dir, { recursive: true, force: true });
      }),
    );
  });

  it("exposes the bundled Typst template", async () => {
    expect(getTypstTemplatePath()).toContain("jake-resume.typ");
    const template = await readTypstTemplate();
    expect(template).toContain("#set page");
    expect(template).toContain("__BODY__");
  });

  it("uses the TYPST_BIN override when present", () => {
    const previous = process.env.TYPST_BIN;
    process.env.TYPST_BIN = "/tmp/custom-typst";
    expect(getTypstBinary()).toBe("/tmp/custom-typst");
    if (previous === undefined) {
      delete process.env.TYPST_BIN;
    } else {
      process.env.TYPST_BIN = previous;
    }
  });

  it("renders the classic theme tokens and English section titles", () => {
    const typst = buildTypstDocument(
      {
        ...baseDocument,
        sectionTitles: undefined,
      },
      "__PAGE_MARGIN__\n__BODY_SIZE__\n__NAME__\n__BODY__",
      "classic",
    );

    expect(typst).toContain("(x: 0.65in, y: 0.58in)");
    expect(typst).toContain("10pt");
    expect(typst).toContain("Jane Doe");
    expect(typst).toContain("= Summary");
    expect(typst).toContain("= Experience");
    expect(typst).toContain("= Technical Skills");
  });

  it("renders compact theme tokens and localized section titles", () => {
    const typst = buildTypstDocument(
      {
        ...baseDocument,
        sectionTitles: {
          summary: "Resumen",
          experience: "Experiencia",
          education: "Educación",
          projects: "Proyectos",
          skills: "Habilidades técnicas",
        },
      },
      "__PAGE_MARGIN__\n__BODY_SIZE__\n__NAME__\n__BODY__",
      "compact",
    );

    expect(typst).toContain("(x: 0.48in, y: 0.45in)");
    expect(typst).toContain("9pt");
    expect(typst).toContain("= Resumen");
    expect(typst).toContain("= Experiencia");
    expect(typst).toContain("= Habilidades técnicas");
  });

  it("escapes Typst markup characters in resume content", () => {
    const typst = buildTypstDocument(
      {
        ...baseDocument,
        name: "Jane #1 [Platform]",
        summary: "Uses #hashes, *stars*, and [brackets].",
      },
      "__NAME__\n__BODY__",
    );

    expect(typst).toContain("Jane \\#1 \\[Platform\\]");
    expect(typst).toContain("\\#hashes, \\*stars\\*, and \\[brackets\\]");
  });

  it("fails with a helpful error when typst is unavailable", async () => {
    const previous = process.env.TYPST_BIN;
    process.env.TYPST_BIN = "/definitely/missing/typst";
    const tempDir = await createTempDir();
    tempDirs.push(tempDir);
    const outputPath = join(tempDir, "resume.pdf");

    await expect(
      renderTypstPdf({
        document: baseDocument,
        outputPath,
        jobId: "job-missing-typst",
      }),
    ).rejects.toThrow(/Typst binary not found/i);

    if (previous === undefined) {
      delete process.env.TYPST_BIN;
    } else {
      process.env.TYPST_BIN = previous;
    }
  });

  it.skipIf(!typstAvailable())(
    "renders a PDF when typst is installed",
    async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);
      const outputPath = join(tempDir, "resume.pdf");

      await renderTypstPdf({
        document: baseDocument,
        outputPath,
        jobId: "job-render-success",
        typstTheme: "compact",
      });

      const stats = spawnSync("sh", ["-lc", `test -s "${outputPath}"`], {
        stdio: "ignore",
      });
      expect(stats.status).toBe(0);
    },
  );
});
