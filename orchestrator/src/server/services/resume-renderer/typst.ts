import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { TYPST_THEME_VALUES, type TypstTheme } from "@shared/types";
import { getLatexResumeSectionTitles } from "./document";
import type {
  LatexResumeContactItem,
  LatexResumeDocument,
  LatexResumeEntry,
  ResumeRenderer,
} from "./types";

const TYPST_TIMEOUT_MS = 120_000;
const OUTPUT_FILENAME = "resume.pdf";
const RESUME_DATA_FILENAME = "resume-data.json";
const THEME_MANIFEST_FILENAME = "theme.json";

const REQUIRED_NATIVE_TOKEN_KEYS = [
  "pageMargin",
  "bodySize",
  "parLeading",
  "sectionTop",
  "sectionBottom",
  "sectionSize",
  "lineWidth",
  "nameSize",
  "headlineSize",
  "contactSize",
  "entryMetaSize",
  "accent",
] as const;

export type TypstThemeTokens = Record<
  (typeof REQUIRED_NATIVE_TOKEN_KEYS)[number],
  string
>;

export interface TypstThemeManifest {
  id: TypstTheme;
  label: string;
  description: string;
  kind: "native" | "adapted";
  entrypoint: string;
  tokens?: TypstThemeTokens;
}

function resolveThemesRoot(): string {
  try {
    if (import.meta.url.startsWith("file:")) {
      const modulePath = fileURLToPath(import.meta.url);
      const moduleRelativePath = join(modulePath, "..", "typst-themes");
      if (existsSync(moduleRelativePath)) {
        return moduleRelativePath;
      }
    }
  } catch {
    // Fall through to cwd-based resolution below.
  }

  const cwd = process.cwd();
  if (cwd.endsWith("/orchestrator")) {
    return join(cwd, "src/server/services/resume-renderer/typst-themes");
  }
  return join(
    cwd,
    "orchestrator/src/server/services/resume-renderer/typst-themes",
  );
}

const THEMES_ROOT = resolveThemesRoot();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertSupportedTheme(theme: TypstTheme): void {
  if (!TYPST_THEME_VALUES.includes(theme)) {
    throw new Error(`Unsupported Typst theme: ${theme}`);
  }
}

function assertSafeThemePath(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`Typst theme ${field} is required`);
  }
  const normalized = normalize(value);
  if (
    normalized.startsWith("..") ||
    normalized.includes("/../") ||
    normalized.includes("\\..\\") ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error(
      `Typst theme ${field} must stay inside its theme directory`,
    );
  }
}

function parseThemeTokens(theme: TypstTheme, value: unknown): TypstThemeTokens {
  if (!isPlainObject(value)) {
    throw new Error(`Typst theme ${theme} requires a tokens object`);
  }

  const tokens: Partial<TypstThemeTokens> = {};
  for (const key of REQUIRED_NATIVE_TOKEN_KEYS) {
    const token = value[key];
    if (typeof token !== "string" || token.trim().length === 0) {
      throw new Error(`Typst theme ${theme} is missing tokens.${key}`);
    }
    tokens[key] = token;
  }

  return tokens as TypstThemeTokens;
}

function parseThemeManifest(
  theme: TypstTheme,
  value: unknown,
): TypstThemeManifest {
  if (!isPlainObject(value)) {
    throw new Error(`Typst theme ${theme} manifest must be an object`);
  }
  if (value.id !== theme) {
    throw new Error(`Typst theme ${theme} manifest id must match the folder`);
  }
  if (typeof value.label !== "string" || value.label.trim().length === 0) {
    throw new Error(`Typst theme ${theme} manifest requires a label`);
  }
  if (
    typeof value.description !== "string" ||
    value.description.trim().length === 0
  ) {
    throw new Error(`Typst theme ${theme} manifest requires a description`);
  }
  if (value.kind !== "native" && value.kind !== "adapted") {
    throw new Error(
      `Typst theme ${theme} manifest kind must be "native" or "adapted"`,
    );
  }
  if (typeof value.entrypoint !== "string") {
    throw new Error(`Typst theme ${theme} manifest requires an entrypoint`);
  }
  assertSafeThemePath(value.entrypoint, "entrypoint");

  return {
    id: theme,
    label: value.label,
    description: value.description,
    kind: value.kind,
    entrypoint: value.entrypoint,
    tokens:
      value.kind === "native"
        ? parseThemeTokens(theme, value.tokens)
        : undefined,
  };
}

function getTypstThemeDir(theme: TypstTheme): string {
  assertSupportedTheme(theme);
  return join(THEMES_ROOT, theme);
}

function getTypstThemeManifestPath(theme: TypstTheme): string {
  return join(getTypstThemeDir(theme), THEME_MANIFEST_FILENAME);
}

export function getTypstTemplatePath(theme: TypstTheme = "classic"): string {
  const raw = readFileSync(getTypstThemeManifestPath(theme), "utf8");
  const manifest = parseThemeManifest(theme, JSON.parse(raw));
  return join(getTypstThemeDir(theme), manifest.entrypoint);
}

function normalizeText(value: string): string {
  return value
    .replace(/\u2010|\u2011|\u2012|\u2013|\u2014/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeTypstText(value: string): string {
  return normalizeText(value).replace(/([\\#*$@_[\]{}<>`])/g, "\\$1");
}

function escapeTypstUrl(value: string): string {
  return JSON.stringify(value.trim());
}

function renderLink(label: string, url?: string | null): string {
  const renderedLabel = escapeTypstText(label);
  if (!url) return renderedLabel;
  return `#link(${escapeTypstUrl(url)})[${renderedLabel}]`;
}

function renderContactItems(items: LatexResumeContactItem[]): string {
  return items
    .map((item) => renderLink(item.text, item.url))
    .join(" #h(4pt) | #h(4pt) ");
}

function renderBullets(items: string[]): string {
  if (items.length === 0) return "";
  return items.map((item) => `- ${escapeTypstText(item)}`).join("\n");
}

function renderEntryHeader(entry: LatexResumeEntry, metaSize: string): string {
  const title = renderLink(entry.title, entry.url);
  const date = entry.date
    ? `#text(size: ${metaSize})[${escapeTypstText(entry.date)}]`
    : "[]";
  return `#grid(columns: (1fr, auto), column-gutter: 1em, [*${title}*], [${date}])`;
}

function renderSubheadingEntry(
  entry: LatexResumeEntry,
  metaSize: string,
): string {
  const subtitle = entry.subtitle ? escapeTypstText(entry.subtitle) : "";
  const secondaryTitle = entry.secondaryTitle
    ? escapeTypstText(entry.secondaryTitle)
    : "";
  const secondarySubtitle = entry.secondarySubtitle
    ? escapeTypstText(entry.secondarySubtitle)
    : "";
  const subline = [subtitle || secondaryTitle, secondarySubtitle]
    .filter(Boolean)
    .join(" / ");
  const bullets = renderBullets(entry.bullets);

  return [
    renderEntryHeader(entry, metaSize),
    subline ? `#emph[${subline}]` : "",
    bullets,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderProjectEntry(entry: LatexResumeEntry, metaSize: string): string {
  const title = renderLink(entry.title, entry.url);
  const subtitle = entry.subtitle
    ? ` #emph[${escapeTypstText(entry.subtitle)}]`
    : "";
  const date = entry.date
    ? `#text(size: ${metaSize})[${escapeTypstText(entry.date)}]`
    : "[]";
  const bullets = renderBullets(entry.bullets);
  return [
    `#grid(columns: (1fr, auto), column-gutter: 1em, [*${title}*${subtitle}], [${date}])`,
    bullets,
  ]
    .filter(Boolean)
    .join("\n");
}

function renderSummarySection(document: LatexResumeDocument): string {
  if (!document.summary) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  return [
    `= ${escapeTypstText(titles.summary)}`,
    escapeTypstText(document.summary),
  ].join("\n\n");
}

function renderEntrySection(args: {
  title: string;
  entries: LatexResumeEntry[];
  kind: "subheading" | "project";
  metaSize: string;
}): string {
  if (args.entries.length === 0) return "";
  const body = args.entries
    .map((entry) =>
      args.kind === "project"
        ? renderProjectEntry(entry, args.metaSize)
        : renderSubheadingEntry(entry, args.metaSize),
    )
    .join("\n\n");
  return [`= ${escapeTypstText(args.title)}`, body].join("\n\n");
}

function renderSkillsSection(document: LatexResumeDocument): string {
  if (document.skillGroups.length === 0) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const items = document.skillGroups
    .map((group) => {
      const keywords = group.keywords.map((keyword) =>
        escapeTypstText(keyword),
      );
      return `*${escapeTypstText(group.name)}:* ${keywords.join(", ")}`;
    })
    .join(" \\\n");
  return [`= ${escapeTypstText(titles.skills)}`, items].join("\n\n");
}

export async function readTypstThemeManifest(
  theme: TypstTheme = "classic",
): Promise<TypstThemeManifest> {
  const raw = await readFile(getTypstThemeManifestPath(theme), "utf8");
  return parseThemeManifest(theme, JSON.parse(raw));
}

export async function readTypstTheme(theme: TypstTheme = "classic"): Promise<{
  manifest: TypstThemeManifest;
  template: string;
  tokens?: TypstThemeTokens;
}> {
  const manifest = await readTypstThemeManifest(theme);
  const templatePath = join(getTypstThemeDir(theme), manifest.entrypoint);
  const template = await readFile(templatePath, "utf8");
  return { manifest, template, tokens: manifest.tokens };
}

async function loadTemplate(theme: TypstTheme): Promise<{
  manifest: TypstThemeManifest;
  template: string;
  tokens?: TypstThemeTokens;
}> {
  const { manifest, template, tokens } = await readTypstTheme(theme);
  return { manifest, template, tokens };
}

function replaceSharedTypstPlaceholders(template: string): string {
  return template.replaceAll(
    "__RESUME_DATA_PATH__",
    JSON.stringify(RESUME_DATA_FILENAME),
  );
}

function buildAdaptedTypstDocument(template: string): string {
  return replaceSharedTypstPlaceholders(template);
}

export function buildTypstDocument(
  document: LatexResumeDocument,
  template: string,
  tokens: TypstThemeTokens,
): string {
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const headlineBlock = document.headline
    ? `  #text(size: ${tokens.headlineSize})[${escapeTypstText(document.headline)}] \\\n`
    : "";
  const contactBlock =
    document.contactItems.length > 0
      ? `  #text(size: ${tokens.contactSize})[${renderContactItems(document.contactItems)}]\n`
      : "";
  const body = [
    renderSummarySection(document),
    renderEntrySection({
      title: titles.experience,
      entries: document.experience,
      kind: "subheading",
      metaSize: tokens.entryMetaSize,
    }),
    renderEntrySection({
      title: titles.education,
      entries: document.education,
      kind: "subheading",
      metaSize: tokens.entryMetaSize,
    }),
    renderEntrySection({
      title: titles.projects,
      entries: document.projects,
      kind: "project",
      metaSize: tokens.entryMetaSize,
    }),
    renderSkillsSection(document),
  ]
    .filter(Boolean)
    .join("\n\n");

  return replaceSharedTypstPlaceholders(template)
    .replace("__PAGE_MARGIN__", tokens.pageMargin)
    .replace("__BODY_SIZE__", tokens.bodySize)
    .replace("__PAR_LEADING__", tokens.parLeading)
    .replace("__SECTION_TOP__", tokens.sectionTop)
    .replace("__SECTION_SIZE__", tokens.sectionSize)
    .replace("__ACCENT__", tokens.accent)
    .replace("__LINE_WIDTH__", tokens.lineWidth)
    .replace("__SECTION_BOTTOM__", tokens.sectionBottom)
    .replace("__NAME_SIZE__", tokens.nameSize)
    .replace("__NAME__", escapeTypstText(document.name))
    .replace("__HEADLINE_BLOCK__", headlineBlock)
    .replace("__CONTACT_BLOCK__", contactBlock)
    .replace("__BODY__", body);
}

function truncateOutput(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= 1200) return trimmed;
  return `${trimmed.slice(0, 1200)}...(truncated ${trimmed.length - 1200} chars)`;
}

async function runTypst(args: {
  cwd: string;
  typPath: string;
  outputPath: string;
  jobId: string;
}): Promise<void> {
  const binary = process.env.TYPST_BIN?.trim() || "typst";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, ["compile", args.typPath, args.outputPath], {
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
          `Typst timed out after ${TYPST_TIMEOUT_MS / 1000}s while rendering resume PDF.`,
        ),
      );
    }, TYPST_TIMEOUT_MS);

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
            "Typst binary not found. Install typst or set TYPST_BIN to the executable path.",
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
          `Typst failed with exit code ${code ?? "unknown"}. ${truncateOutput(stderr || stdout)}`,
        ),
      );
    });
  }).catch((error) => {
    logger.warn("Typst resume compile failed", {
      jobId: args.jobId,
      error,
      compiler: binary,
    });
    throw error;
  });
}

export const typstResumeRenderer: ResumeRenderer = {
  async render({ document, outputPath, jobId, typstTheme = "classic" }) {
    const tempDir = await mkdtemp(join(tmpdir(), "job-ops-resume-render-"));
    const typPath = join(tempDir, "resume.typ");
    const resumeDataPath = join(tempDir, RESUME_DATA_FILENAME);
    const compiledPdfPath = join(tempDir, OUTPUT_FILENAME);

    try {
      const { manifest, template, tokens } = await loadTemplate(typstTheme);
      let typst: string;
      if (manifest.kind === "native") {
        if (!tokens) {
          throw new Error(
            `Typst theme ${typstTheme} is missing native tokens.`,
          );
        }
        typst = buildTypstDocument(document, template, tokens);
      } else {
        typst = buildAdaptedTypstDocument(template);
      }

      await writeFile(resumeDataPath, JSON.stringify(document), "utf8");
      await writeFile(typPath, typst, "utf8");
      await runTypst({
        cwd: tempDir,
        typPath,
        outputPath: compiledPdfPath,
        jobId,
      });
      await copyFile(compiledPdfPath, outputPath);

      logger.info("Rendered Typst resume PDF", {
        jobId,
        outputPath,
        typstTheme,
      });
    } catch (error) {
      logger.error("Failed to render Typst resume PDF", {
        jobId,
        outputPath,
        typstTheme,
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
          logger.warn("Failed to cleanup temporary Typst render directory", {
            jobId,
            tempDir,
            error: cleanupError,
          });
        },
      );
    }
  },
};

export async function renderTypstPdf(args: {
  document: LatexResumeDocument;
  outputPath: string;
  jobId: string;
  typstTheme?: TypstTheme;
}): Promise<void> {
  await typstResumeRenderer.render(args);
}

export function getTypstBinary(): string {
  return process.env.TYPST_BIN?.trim() || "typst";
}

export async function readTypstTemplate(
  theme: TypstTheme = "classic",
): Promise<string> {
  return (await readTypstTheme(theme)).template;
}
