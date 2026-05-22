import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildLatexDocument,
  getLatexTemplatePath,
  getTectonicBinary,
  readLatexTemplate,
  renderLatexPdf,
} from "./latex";
import type { ResumeRenderDocument } from "./types";

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

  it("defaults LaTeX section titles to English", () => {
    const latex = buildLatexDocument(
      {
        ...baseDocument,
        sectionTitles: undefined,
      },
      "__NAME__\n__HEADLINE_BLOCK__\n__CONTACT_BLOCK__\n__BODY__",
    );

    expect(latex).toContain("\\section{Summary}");
    expect(latex).toContain("\\section{Experience}");
    expect(latex).toContain("\\section{Technical Skills}");
  });

  it("renders localized LaTeX section titles", () => {
    const latex = buildLatexDocument(
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
      "__NAME__\n__HEADLINE_BLOCK__\n__CONTACT_BLOCK__\n__BODY__",
    );

    expect(latex).toContain("\\section{Resumen}");
    expect(latex).toContain("\\section{Experiencia}");
    expect(latex).toContain("\\section{Educación}");
    expect(latex).toContain("\\section{Proyectos}");
    expect(latex).toContain("\\section{Habilidades técnicas}");
  });

  it("respects custom core section ordering", () => {
    const latex = buildLatexDocument(
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
    );

    expect(latex.indexOf("\\section{Technical Skills}")).toBeLessThan(
      latex.indexOf("\\section{Projects}"),
    );
    expect(latex.indexOf("\\section{Projects}")).toBeLessThan(
      latex.indexOf("\\section{Experience}"),
    );
  });

  it("renders the newly supported sections and picture block", () => {
    const latex = buildLatexDocument(
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
            title: "Eligibility",
            text: "Eligible to work in the UK",
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
      "__PICTURE_BLOCK__\n__NAME__\n__HEADLINE_BLOCK__\n__CONTACT_BLOCK__\n__LOCATION_BLOCK__\n__BODY__",
    );

    expect(latex).toContain("\\includegraphics");
    expect(latex).toContain("London, UK");
    expect(latex).toContain("\\section{Profiles}");
    expect(latex).toContain("\\section{Custom Fields}");
    expect(latex).toContain(
      "\\textbf{Eligibility}{: Eligible to work in the UK}",
    );
    expect(latex).toContain("\\section{Languages}");
    expect(latex).toContain("\\section{Interests}");
    expect(latex).toContain("\\section{Awards}");
    expect(latex).toContain("\\section{Certifications}");
    expect(latex).toContain("\\section{Publications}");
    expect(latex).toContain("\\section{Volunteer}");
    expect(latex).toContain("\\section{References}");
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
