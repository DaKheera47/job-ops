import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TYPST_THEME_VALUES, type TypstTheme } from "@shared/types";
import { afterEach, describe, expect, it } from "vitest";
import type { LatexResumeDocument } from "./types";
import {
  buildTypstDocument,
  getTypstBinary,
  getTypstTemplatePath,
  readTypstTemplate,
  readTypstTheme,
  readTypstThemeManifest,
  renderTypstPdf,
  type TypstThemeTokens,
} from "./typst";

const nativeThemes = new Set(["classic", "compact"]);

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

async function readNativeThemeTokens(
  theme: TypstTheme,
): Promise<TypstThemeTokens> {
  const loadedTheme = await readTypstTheme(theme);
  if (!loadedTheme.tokens) {
    throw new Error(`Expected ${theme} to be a native Typst theme`);
  }
  return loadedTheme.tokens;
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
    expect(getTypstTemplatePath()).toContain("typst-themes/classic/main.typ");
    const template = await readTypstTemplate();
    expect(template).toContain("#set page");
    expect(template).toContain("__BODY__");
  });

  it("loads every generated Typst theme manifest", async () => {
    for (const theme of TYPST_THEME_VALUES) {
      const manifest = await readTypstThemeManifest(theme);
      expect(manifest.id).toBe(theme);
      expect(manifest.entrypoint).toBe("main.typ");
      expect(["native", "adapted"]).toContain(manifest.kind);
      if (nativeThemes.has(theme)) {
        expect(manifest.tokens).toBeDefined();
      } else {
        expect(manifest.tokens).toBeUndefined();
      }
      expect(getTypstTemplatePath(theme)).toContain(
        `typst-themes/${theme}/main.typ`,
      );
    }
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

  it("renders the classic theme tokens and English section titles", async () => {
    const tokens = await readNativeThemeTokens("classic");
    const typst = buildTypstDocument(
      {
        ...baseDocument,
        sectionTitles: undefined,
      },
      "__PAGE_MARGIN__\n__BODY_SIZE__\n__NAME__\n__BODY__",
      tokens,
    );

    expect(typst).toContain("(x: 0.65in, y: 0.58in)");
    expect(typst).toContain("10pt");
    expect(typst).toContain("Jane Doe");
    expect(typst).toContain("= Summary");
    expect(typst).toContain("= Experience");
    expect(typst).toContain("= Technical Skills");
  });

  it("renders compact theme tokens and localized section titles", async () => {
    const tokens = await readNativeThemeTokens("compact");
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
      tokens,
    );

    expect(typst).toContain("(x: 0.48in, y: 0.45in)");
    expect(typst).toContain("9pt");
    expect(typst).toContain("= Resumen");
    expect(typst).toContain("= Experiencia");
    expect(typst).toContain("= Habilidades técnicas");
  });

  it("exposes a stable resume data path for package-backed themes", async () => {
    const tokens = await readNativeThemeTokens("classic");
    const typst = buildTypstDocument(
      baseDocument,
      "#let resume = json(__RESUME_DATA_PATH__)\n__NAME__",
      tokens,
    );

    expect(typst).toContain('#let resume = json("resume-data.json")');
  });

  it("keeps links in the clean-print-cv adapter", async () => {
    const template = await readTypstTemplate("clean-print-cv");

    expect(template).toContain("link-or-text");
    expect(template).toContain("contact-label-matching(is-linkedin)");
    expect(template).toContain("contact-label-matching(is-github)");
    expect(template).toContain("linked-entry-label(entry");
    expect(template).toContain("linked-url-label(entry)");
  });

  it("escapes Typst markup characters in resume content", async () => {
    const tokens = await readNativeThemeTokens("classic");
    const typst = buildTypstDocument(
      {
        ...baseDocument,
        name: "Jane #1 [Platform]",
        summary: "Uses #hashes, *stars*, and [brackets].",
      },
      "__NAME__\n__BODY__",
      tokens,
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
