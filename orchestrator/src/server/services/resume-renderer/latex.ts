import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { getLatexResumeSectionTitles } from "./document";
import type {
  LatexResumeContactItem,
  LatexResumeDocument,
  LatexResumeEntry,
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
    renderEntrySection({
      title: titles.experience,
      entries: document.experience,
      kind: "subheading",
    }),
    renderEntrySection({
      title: titles.education,
      entries: document.education,
      kind: "subheading",
    }),
    renderEntrySection({
      title: titles.projects,
      entries: document.projects,
      kind: "project",
    }),
    renderSkillsSection(document),
  ]
    .filter(Boolean)
    .join("\n");

  return template
    .replace("__NAME__", escapeForCommand(document.name))
    .replace("__HEADLINE_BLOCK__", headlineBlock)
    .replace("__CONTACT_BLOCK__", contactBlock)
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
            `Tectonic binary not found. Install tectonic or set TECTONIC_BIN to the executable path.`,
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
      const latex = buildLatexDocument(document, template);

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
          experienceCount: document.experience.length,
          educationCount: document.education.length,
          projectCount: document.projects.length,
          skillGroupCount: document.skillGroups.length,
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
