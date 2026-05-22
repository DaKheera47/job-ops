import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TYPST_THEME_VALUES, type TypstTheme } from "@shared/types";
import { afterEach, describe, expect, it } from "vitest";
import type { ResumeRenderDocument } from "./types";
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

const baseDocument: ResumeRenderDocument = {
  name: "Jane Doe",
  headline: "Senior Software Engineer",
  location: "London, UK",
  picture: null,
  contactItems: [
    { text: "jane@example.com", url: "mailto:jane@example.com" },
    { text: "Portfolio", url: "https://jane.dev" },
  ],
  profileItems: [],
  customFieldItems: [],
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
  languages: [],
  interests: [],
  awards: [],
  certifications: [],
  publications: [],
  volunteer: [],
  references: [],
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
        education: [
          {
            title: "University",
            subtitle: "MSc",
            date: "2020",
            bullets: ["Studied distributed systems"],
          },
        ],
        projects: [
          {
            title: "Platform",
            subtitle: "TypeScript",
            date: "2024",
            bullets: ["Built deployment tooling"],
          },
        ],
        sectionTitles: {
          profiles: "Perfiles",
          summary: "Resumen",
          customFields: "Campos personalizados",
          experience: "Experiencia",
          education: "Educación",
          projects: "Proyectos",
          skills: "Habilidades técnicas",
          languages: "Idiomas",
          interests: "Intereses",
          awards: "Premios",
          certifications: "Certificaciones",
          publications: "Publicaciones",
          volunteer: "Voluntariado",
          references: "Referencias",
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

  it("respects custom core section ordering", async () => {
    const tokens = await readNativeThemeTokens("classic");
    const typst = buildTypstDocument(
      {
        ...baseDocument,
        education: [
          {
            title: "University",
            subtitle: "MSc",
            date: "2020",
            bullets: ["Studied distributed systems"],
          },
        ],
        projects: [
          {
            title: "Platform",
            subtitle: "TypeScript",
            date: "2024",
            bullets: ["Built deployment tooling"],
          },
        ],
        sectionOrder: ["skills", "projects", "experience", "education"],
      },
      "__BODY__",
      tokens,
    );

    expect(typst.indexOf("= Technical Skills")).toBeLessThan(
      typst.indexOf("= Projects"),
    );
    expect(typst.indexOf("= Projects")).toBeLessThan(
      typst.indexOf("= Experience"),
    );
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
    expect(template).toContain("profile-label-matching(is-linkedin-profile)");
    expect(template).toContain("profile-label-matching(is-github-profile)");
    expect(template).toContain("linked-entry-label(entry");
    expect(template).toContain('link(text-of-item(entry, "url"))');
  });

  it("renders award-style sections as Typst bullet lists in clean-print-cv", async () => {
    const template = await readTypstTemplate("clean-print-cv");

    expect(template).toContain("#let bullet-trailing(entry)");
    expect(template).toContain('text-of(section-titles.at("awards"');
    expect(template).toContain("trailing: bullet-trailing(entry)");
  });

  it("renders the newly supported native sections and picture block", async () => {
    const tokens = await readNativeThemeTokens("classic");
    const typst = buildTypstDocument(
      {
        ...baseDocument,
        picture: {
          url: "https://jane.dev/photo.png",
          assetId: null,
          renderPath: "/tmp/resume-picture.png",
          hidden: false,
          size: 88,
          rotation: 0,
          aspectRatio: 1,
          borderRadius: 0,
          borderColor: "",
          borderWidth: 0,
          shadowColor: "",
          shadowWidth: 0,
        },
        profileItems: [
          {
            network: "LinkedIn",
            username: "janedoe",
            url: "https://linkedin.com/in/janedoe",
          },
        ],
        customFieldItems: [
          {
            title: "Availability",
            text: "Open to relocation",
            url: null,
          },
        ],
        languages: [{ language: "English", fluency: "Native", level: 5 }],
        interests: [{ name: "Climbing", keywords: ["Bouldering"] }],
        awards: [
          {
            title: "Engineer of the Year",
            subtitle: "Acme",
            date: "2024",
            bullets: ["Recognized for platform leadership"],
          },
        ],
        certifications: [
          {
            title: "AWS Solutions Architect",
            subtitle: "Amazon",
            date: "2023",
            bullets: ["Professional level"],
          },
        ],
        publications: [
          {
            title: "Scaling JobOps",
            subtitle: "InfoQ",
            date: "2022",
            bullets: ["Published architecture write-up"],
          },
        ],
        volunteer: [
          {
            title: "STEM Mentor",
            subtitle: "Code Club",
            date: "2021 -- Present",
            bullets: ["Mentor students weekly"],
          },
        ],
        references: [
          {
            title: "Alex Manager",
            subtitle: "Director | +44 1234 567890",
            bullets: ["Reference available on request"],
          },
        ],
      },
      "__PICTURE_BLOCK__\n__NAME__\n__HEADLINE_BLOCK__\n__LOCATION_BLOCK__\n__CONTACT_BLOCK__\n__BODY__",
      tokens,
    );

    expect(typst).toContain('#image("/tmp/resume-picture.png"');
    expect(typst).toContain("London, UK");
    expect(typst).toContain("= Profiles");
    expect(typst).toContain("= Custom Fields");
    expect(typst).toContain("*Availability:* Open to relocation");
    expect(typst).toContain("= Languages");
    expect(typst).toContain("= Interests");
    expect(typst).toContain("= Awards");
    expect(typst).toContain("= Certifications");
    expect(typst).toContain("= Publications");
    expect(typst).toContain("= Volunteer");
    expect(typst).toContain("= References");
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

  it.skipIf(!typstAvailable())(
    "renders the clean-print-cv theme when typst is installed",
    async () => {
      const tempDir = await createTempDir();
      tempDirs.push(tempDir);
      const outputPath = join(tempDir, "clean-print-cv.pdf");

      await renderTypstPdf({
        document: {
          ...baseDocument,
          profileItems: [
            {
              network: "LinkedIn",
              username: "janedoe",
              url: "https://linkedin.com/in/janedoe",
            },
          ],
          languages: [{ language: "English", fluency: "Native", level: 5 }],
          certifications: [
            {
              title: "AWS Solutions Architect",
              subtitle: "Amazon",
              date: "2023",
              bullets: ["Professional level"],
            },
          ],
        },
        outputPath,
        jobId: "job-render-clean-print-cv",
        typstTheme: "clean-print-cv",
      });

      const stats = spawnSync("sh", ["-lc", `test -s "${outputPath}"`], {
        stdio: "ignore",
      });
      expect(stats.status).toBe(0);
    },
  );
});
