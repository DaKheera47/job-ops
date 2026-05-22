import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { getLatexResumeSectionTitles } from "./document";
import { materializeResumePicture } from "./picture";
import type {
  LatexResumeContactItem,
  LatexResumeCustomFieldItem,
  LatexResumeDocument,
  LatexResumeEntry,
  LatexResumeInterestItem,
  LatexResumeLanguageItem,
  LatexResumeOrderedSectionKey,
  ResumeRenderer,
} from "./types";

function resolveTemplatePath(): string {
  try {
    if (import.meta.url.startsWith("file:")) {
      const modulePath = fileURLToPath(import.meta.url);
      const moduleRelativePath = join(
        modulePath,
        "..",
        "templates",
        "jake-resume.tex",
      );
      if (existsSync(moduleRelativePath)) {
        return moduleRelativePath;
      }
    }
  } catch {
    // Fall through to cwd-based resolution below.
  }

  const cwd = process.cwd();
  if (cwd.endsWith("/orchestrator")) {
    return join(
      cwd,
      "src/server/services/resume-renderer/templates/jake-resume.tex",
    );
  }
  return join(
    cwd,
    "orchestrator/src/server/services/resume-renderer/templates/jake-resume.tex",
  );
}

const TEMPLATE_PATH = resolveTemplatePath();
const TECTONIC_TIMEOUT_MS = 120_000;
const OUTPUT_FILENAME = "resume.pdf";

function normalizeText(value: string): string {
  return value
    .replace(/\u2010|\u2011|\u2012|\u2013|\u2014/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeLatexText(value: string): string {
  return normalizeText(value)
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function escapeLatexUrl(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([#$%&_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

function escapeForCommand(value: string): string {
  return escapeLatexText(value).replace(/\|/g, "{\\textbar}");
}

function renderLink(label: string, url?: string | null): string {
  if (!url) return escapeForCommand(label);
  return `\\href{${escapeLatexUrl(url)}}{\\underline{${escapeForCommand(label)}}}`;
}

function renderContactItems(items: LatexResumeContactItem[]): string {
  return items.map((item) => renderLink(item.text, item.url)).join(" $|$ ");
}

function renderBullets(items: string[]): string {
  if (items.length === 0) return "";
  return [
    "      \\resumeItemListStart",
    ...items.map((item) => `        \\resumeItem{${escapeForCommand(item)}}`),
    "      \\resumeItemListEnd",
  ].join("\n");
}

function renderSubheadingEntry(entry: LatexResumeEntry): string {
  const title = renderLink(entry.title, entry.url);
  const subtitle = entry.subtitle ? escapeForCommand(entry.subtitle) : "";
  const secondaryTitle = entry.secondaryTitle
    ? escapeForCommand(entry.secondaryTitle)
    : "";
  const secondarySubtitle = entry.secondarySubtitle
    ? escapeForCommand(entry.secondarySubtitle)
    : "";
  const date = entry.date ? escapeForCommand(entry.date) : "";

  const lines = [
    "    \\resumeSubheading",
    `      {${title}}{${date}}`,
    `      {${subtitle || secondaryTitle}}{${secondarySubtitle || ""}}`,
  ];

  const bullets = renderBullets(entry.bullets);
  if (bullets) lines.push(bullets);
  return lines.join("\n");
}

function renderProjectEntry(entry: LatexResumeEntry): string {
  const title = renderLink(entry.title, entry.url);
  const subtitle = entry.subtitle
    ? ` $|$ \\emph{${escapeForCommand(entry.subtitle)}}`
    : "";
  const date = entry.date ? escapeForCommand(entry.date) : "";
  const lines = [
    "      \\resumeProjectHeading",
    `          {\\textbf{${title}}${subtitle}}{${date}}`,
  ];
  const bullets = renderBullets(entry.bullets);
  if (bullets) lines.push(bullets);
  return lines.join("\n");
}

function renderSummarySection(document: LatexResumeDocument): string {
  if (!document.summary) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  return [
    `\\section{${escapeForCommand(titles.summary)}}`,
    " \\begin{itemize}[leftmargin=0.15in, label={}]",
    `    \\small{\\item{${escapeForCommand(document.summary)}}}`,
    " \\end{itemize}",
    "",
  ].join("\n");
}

function renderEntrySection(args: {
  title: string;
  entries: LatexResumeEntry[];
  kind: "subheading" | "project";
}): string {
  if (args.entries.length === 0) return "";
  const body = args.entries
    .map((entry) =>
      args.kind === "project"
        ? renderProjectEntry(entry)
        : renderSubheadingEntry(entry),
    )
    .join("\n\n");
  return [
    `\\section{${escapeForCommand(args.title)}}`,
    "  \\resumeSubHeadingListStart",
    body,
    "  \\resumeSubHeadingListEnd",
    "",
  ].join("\n");
}

function renderSkillsSection(document: LatexResumeDocument): string {
  if (document.skillGroups.length === 0) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const items = document.skillGroups
    .map((group) => {
      const keywords = group.keywords.map((keyword) =>
        escapeForCommand(keyword),
      );
      const keywordsText = keywords.join(", ");
      return `     \\textbf{${escapeForCommand(group.name)}}{: ${keywordsText}} \\\\`;
    })
    .join("\n");
  return [
    `\\section{${escapeForCommand(titles.skills)}}`,
    " \\begin{itemize}[leftmargin=0.15in, label={}]",
    "    \\small{\\item{",
    items,
    "    }}",
    " \\end{itemize}",
    "",
  ].join("\n");
}

function renderLineSection(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  return [
    `\\section{${escapeForCommand(title)}}`,
    " \\begin{itemize}[leftmargin=0.15in, label={}]",
    ...lines.map((line) => `    \\small{\\item{${line}}}`),
    " \\end{itemize}",
    "",
  ].join("\n");
}

function renderProfilesSection(document: LatexResumeDocument): string {
  if (document.profileItems.length === 0) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const lines = document.profileItems.map((item) => {
    const label = escapeForCommand(item.network);
    const value = renderLink(
      item.username || item.url || item.network,
      item.url,
    );
    return `\\textbf{${label}}{: ${value}}`;
  });
  return renderLineSection(titles.profiles, lines);
}

function renderCustomFieldsSection(document: LatexResumeDocument): string {
  if (document.customFieldItems.length === 0) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const lines = document.customFieldItems.map(
    (item: LatexResumeCustomFieldItem) => {
      const value = item.url
        ? renderLink(item.text, item.url)
        : escapeForCommand(item.text);
      if (!item.title) return value;
      if (item.title === item.text) {
        return `\\textbf{${escapeForCommand(item.title)}}`;
      }
      return `\\textbf{${escapeForCommand(item.title)}}{: ${value}}`;
    },
  );
  return renderLineSection(titles.customFields, lines);
}

function renderLanguagesSection(document: LatexResumeDocument): string {
  if (document.languages.length === 0) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const lines = document.languages.map((item: LatexResumeLanguageItem) => {
    const detailParts = [
      item.fluency ? escapeForCommand(item.fluency) : "",
      item.level !== null && item.level !== undefined
        ? `Level ${escapeForCommand(String(item.level))}`
        : "",
    ].filter(Boolean);
    const detail = detailParts.join(" | ");
    return detail
      ? `\\textbf{${escapeForCommand(item.language)}}{: ${detail}}`
      : `\\textbf{${escapeForCommand(item.language)}}`;
  });
  return renderLineSection(titles.languages, lines);
}

function renderInterestsSection(document: LatexResumeDocument): string {
  if (document.interests.length === 0) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const lines = document.interests.map((item: LatexResumeInterestItem) => {
    const keywords = item.keywords.map((keyword) => escapeForCommand(keyword));
    return keywords.length > 0
      ? `\\textbf{${escapeForCommand(item.name)}}{: ${keywords.join(", ")}}`
      : `\\textbf{${escapeForCommand(item.name)}}`;
  });
  return renderLineSection(titles.interests, lines);
}

function renderPictureBlock(document: LatexResumeDocument): string {
  const picture = document.picture;
  if (!picture?.renderPath || picture.hidden) return "";

  const width = Math.max(48, Math.min(picture.size, 144));
  const height = Math.max(
    48,
    Math.round(width / Math.max(picture.aspectRatio, 0.5)),
  );
  const angle = picture.rotation
    ? `,angle=${Math.round(picture.rotation)}`
    : "";

  return [
    `    \\includegraphics[width=${width}pt,height=${height}pt,keepaspectratio${angle}]{\\detokenize{${picture.renderPath}}} \\\\`,
    "    \\vspace{4pt}",
  ].join("\n");
}

function renderLocationBlock(document: LatexResumeDocument): string {
  if (!document.location) return "";
  return `\\begin{center}\\small ${escapeForCommand(document.location)}\\end{center}\n`;
}

function renderOrderedCoreSections(
  document: LatexResumeDocument,
  titles: ReturnType<typeof getLatexResumeSectionTitles>,
): string[] {
  const sectionOrder = document.sectionOrder ?? [
    "profiles",
    "experience",
    "education",
    "projects",
    "skills",
    "languages",
    "interests",
    "awards",
    "certifications",
    "publications",
    "volunteer",
    "references",
  ];
  const builders: Record<LatexResumeOrderedSectionKey, () => string> = {
    profiles: () => renderProfilesSection(document),
    experience: () =>
      renderEntrySection({
        title: titles.experience,
        entries: document.experience,
        kind: "subheading",
      }),
    education: () =>
      renderEntrySection({
        title: titles.education,
        entries: document.education,
        kind: "subheading",
      }),
    projects: () =>
      renderEntrySection({
        title: titles.projects,
        entries: document.projects,
        kind: "project",
      }),
    skills: () => renderSkillsSection(document),
    languages: () => renderLanguagesSection(document),
    interests: () => renderInterestsSection(document),
    awards: () =>
      renderEntrySection({
        title: titles.awards,
        entries: document.awards,
        kind: "subheading",
      }),
    certifications: () =>
      renderEntrySection({
        title: titles.certifications,
        entries: document.certifications,
        kind: "subheading",
      }),
    publications: () =>
      renderEntrySection({
        title: titles.publications,
        entries: document.publications,
        kind: "subheading",
      }),
    volunteer: () =>
      renderEntrySection({
        title: titles.volunteer,
        entries: document.volunteer,
        kind: "subheading",
      }),
    references: () =>
      renderEntrySection({
        title: titles.references,
        entries: document.references,
        kind: "subheading",
      }),
  };

  return sectionOrder.map((key) => builders[key]());
}

async function loadTemplate(): Promise<string> {
  return await readFile(TEMPLATE_PATH, "utf8");
}

export function buildLatexDocument(
  document: LatexResumeDocument,
  template: string,
): string {
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const headlineBlock = document.headline
    ? `    \\small ${escapeForCommand(document.headline)} \\\\ \\vspace{1pt}\n`
    : "";
  const contactBlock =
    document.contactItems.length > 0
      ? `    \\small ${renderContactItems(document.contactItems)}\n`
      : "";
  const body = [
    renderSummarySection(document),
    renderCustomFieldsSection(document),
    ...renderOrderedCoreSections(document, titles),
  ]
    .filter(Boolean)
    .join("\n");

  return template
    .replace("__PICTURE_BLOCK__", renderPictureBlock(document))
    .replace("__NAME__", escapeForCommand(document.name))
    .replace("__HEADLINE_BLOCK__", headlineBlock)
    .replace("__CONTACT_BLOCK__", contactBlock)
    .replace("__LOCATION_BLOCK__", renderLocationBlock(document))
    .replace("__BODY__", body);
}

function truncateOutput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 1200) return trimmed;
  return `${trimmed.slice(0, 1200)}…(truncated ${trimmed.length - 1200} chars)`;
}

async function runTectonic(args: {
  cwd: string;
  texPath: string;
  jobId: string;
}): Promise<void> {
  const binary = process.env.TECTONIC_BIN?.trim() || "tectonic";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, ["--outdir", args.cwd, args.texPath], {
      cwd: args.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new Error(
          `Tectonic timed out after ${TECTONIC_TIMEOUT_MS / 1000}s while rendering resume PDF.`,
        ),
      );
    }, TECTONIC_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "Tectonic binary not found. Install tectonic or set TECTONIC_BIN to the executable path.",
          ),
        );
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Tectonic failed with exit code ${code ?? "unknown"}. ${truncateOutput(stderr || stdout)}`,
        ),
      );
    });
  }).catch((error) => {
    logger.warn("LaTeX resume compile failed", {
      jobId: args.jobId,
      error,
      compiler: binary,
    });
    throw error;
  });
}

export const latexResumeRenderer: ResumeRenderer = {
  async render({ document, outputPath, jobId }) {
    const tempDir = await mkdtemp(
      join(tmpdir(), `job-ops-resume-render-${jobId}-`),
    );
    const texPath = join(tempDir, "resume.tex");
    const compiledPdfPath = join(tempDir, OUTPUT_FILENAME);

    try {
      const template = await loadTemplate();
      const renderableDocument = await materializeResumePicture(
        document,
        tempDir,
      );
      const latex = buildLatexDocument(renderableDocument, template);

      await writeFile(texPath, latex, "utf8");
      await runTectonic({ cwd: tempDir, texPath, jobId });
      await copyFile(compiledPdfPath, outputPath);

      logger.info("Rendered LaTeX resume PDF", {
        jobId,
        outputPath,
      });
    } catch (error) {
      logger.error("Failed to render LaTeX resume PDF", {
        jobId,
        outputPath,
        error,
        document: sanitizeUnknown({
          name: document.name,
          headline: document.headline,
          location: document.location,
          experienceCount: document.experience.length,
          educationCount: document.education.length,
          projectCount: document.projects.length,
          skillGroupCount: document.skillGroups.length,
          languageCount: document.languages.length,
          interestCount: document.interests.length,
          awardCount: document.awards.length,
          certificationCount: document.certifications.length,
          publicationCount: document.publications.length,
          volunteerCount: document.volunteer.length,
          referenceCount: document.references.length,
        }),
      });
      throw error;
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(
        (cleanupError) => {
          logger.warn("Failed to cleanup temporary LaTeX render directory", {
            jobId,
            tempDir,
            error: cleanupError,
          });
        },
      );
    }
  },
};

export async function renderLatexPdf(args: {
  document: LatexResumeDocument;
  outputPath: string;
  jobId: string;
}): Promise<void> {
  await latexResumeRenderer.render(args);
}

export function getLatexTemplatePath(): string {
  return TEMPLATE_PATH;
}

export function getTectonicBinary(): string {
  return process.env.TECTONIC_BIN?.trim() || "tectonic";
}

export async function readLatexTemplate(): Promise<string> {
  return await loadTemplate();
}
