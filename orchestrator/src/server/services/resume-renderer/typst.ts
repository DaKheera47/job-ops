import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { TYPST_THEME_VALUES, type TypstTheme } from "@shared/types";
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
  LatexResumeStyleOverrides,
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

function escapeRawTypst(value: string): string {
  return value.replace(/([\\#*$@_[\]{}<>`])/g, "\\$1");
}

function escapeTypstText(value: string): string {
  const normalized = normalizeText(value);
  const parts = normalized.split(/(<\/?(?:strong|b|em|i)\b[^>]*>)/gi);
  const result: string[] = [];
  const tagStack: string[] = [];

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith("<") && part.endsWith(">")) {
      const lower = part.toLowerCase();
      if (lower.startsWith("<strong") || lower.startsWith("<b")) {
        result.push("#strong[");
        tagStack.push("bold");
      } else if (lower.startsWith("</strong") || lower.startsWith("</b>")) {
        tagStack.pop();
        result.push("]");
      } else if (lower.startsWith("<em") || lower.startsWith("<i")) {
        result.push("#emph[");
        tagStack.push("italic");
      } else if (lower.startsWith("</em") || lower.startsWith("</i>")) {
        tagStack.pop();
        result.push("]");
      }
    } else {
      result.push(escapeRawTypst(part));
    }
  }

  while (tagStack.pop()) {
    result.push("]");
  }

  return result.join("");
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

function renderLineSection(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  return [
    `= ${escapeTypstText(title)}`,
    ...lines.map((line) => `- ${line}`),
  ].join("\n");
}

function renderProfilesSection(document: LatexResumeDocument): string {
  if (document.profileItems.length === 0) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const lines = document.profileItems.map((item) => {
    const label = escapeTypstText(item.network);
    const value = renderLink(
      item.username || item.url || item.network,
      item.url,
    );
    return `*${label}:* ${value}`;
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
        : escapeTypstText(item.text);
      if (!item.title) return value;
      if (item.title === item.text) {
        return `*${escapeTypstText(item.title)}*`;
      }
      return `*${escapeTypstText(item.title)}:* ${value}`;
    },
  );
  return renderLineSection(titles.customFields, lines);
}

function renderLanguagesSection(document: LatexResumeDocument): string {
  if (document.languages.length === 0) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const lines = document.languages.map((item: LatexResumeLanguageItem) => {
    const detail = [item.fluency, item.level ? `Level ${item.level}` : ""]
      .filter(Boolean)
      .map((part) => escapeTypstText(String(part)))
      .join(" | ");
    return detail
      ? `*${escapeTypstText(item.language)}:* ${detail}`
      : `*${escapeTypstText(item.language)}*`;
  });
  return renderLineSection(titles.languages, lines);
}

function renderInterestsSection(document: LatexResumeDocument): string {
  if (document.interests.length === 0) return "";
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const lines = document.interests.map((item: LatexResumeInterestItem) => {
    const keywords = item.keywords.map((keyword) => escapeTypstText(keyword));
    return keywords.length > 0
      ? `*${escapeTypstText(item.name)}:* ${keywords.join(", ")}`
      : `*${escapeTypstText(item.name)}*`;
  });
  return renderLineSection(titles.interests, lines);
}

function renderPictureBlock(document: LatexResumeDocument): string {
  const picture = document.picture;
  if (!picture?.renderPath || picture.hidden) return "";

  const width = Math.max(48, Math.min(picture.size, 144));
  const image = `#image(${escapeTypstUrl(picture.renderPath)}, width: ${width}pt)`;
  const renderedImage = picture.rotation
    ? `#rotate(angle: ${Math.round(picture.rotation)}deg, reflow: true)[${image}]`
    : image;

  return `${renderedImage} \\\n  #v(4pt)\n`;
}

function renderLocationBlock(document: LatexResumeDocument): string {
  if (!document.location) return "";
  return `  #text(size: 9pt)[${escapeTypstText(document.location)}] \\\n`;
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

function lightenHex(hex: string, whiteFactor: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * whiteFactor);
  const lg = Math.round(g + (255 - g) * whiteFactor);
  const lb = Math.round(b + (255 - b) * whiteFactor);
  return `#${lr.toString(16).padStart(2, "0")}${lg.toString(16).padStart(2, "0")}${lb.toString(16).padStart(2, "0")}`;
}

function replaceStylePlaceholders(
  template: string,
  document: LatexResumeDocument,
  overrides?: LatexResumeStyleOverrides,
): string {
  const style = document.style;
  const bodyFont =
    overrides?.typography?.bodyFontFamily ||
    style?.typography.bodyFontFamily ||
    "IBM Plex Serif";
  const headingFont =
    overrides?.typography?.headingFontFamily ||
    style?.typography.headingFontFamily ||
    bodyFont;
  const primaryHex =
    overrides?.colors?.primaryHex || style?.colors.primaryHex || "#202020";
  const textHex =
    overrides?.colors?.textHex || style?.colors.textHex || "#000000";
  const backgroundHex =
    overrides?.colors?.backgroundHex ||
    style?.colors.backgroundHex ||
    "#ffffff";
  const secondaryBackgroundHex =
    overrides?.colors?.secondaryBackgroundHex ||
    style?.colors.secondaryBackgroundHex ||
    lightenHex(primaryHex, 0.85);

  return template
    .replaceAll("__BODY_FONT__", JSON.stringify(bodyFont))
    .replaceAll("__HEADING_FONT__", JSON.stringify(headingFont))
    .replaceAll("__PRIMARY_COLOR__", `rgb(${JSON.stringify(primaryHex)})`)
    .replaceAll("__TEXT_COLOR__", `rgb(${JSON.stringify(textHex)})`)
    .replaceAll("__BACKGROUND_COLOR__", `rgb(${JSON.stringify(backgroundHex)})`)
    .replaceAll(
      "__SECONDARY_BACKGROUND_COLOR__",
      `rgb(${JSON.stringify(secondaryBackgroundHex)})`,
    )
    .replaceAll(
      "__SIDEBAR_BG_COLOR__",
      `rgb(${JSON.stringify(secondaryBackgroundHex)})`,
    );
}

function buildAdaptedTypstDocument(
  document: LatexResumeDocument,
  template: string,
  overrides?: LatexResumeStyleOverrides,
): string {
  return replaceStylePlaceholders(
    replaceSharedTypstPlaceholders(template),
    document,
    overrides,
  );
}

export function normalizeTypstDocumentPicturePath(
  document: LatexResumeDocument,
  compileCwd: string,
): LatexResumeDocument {
  const picture = document.picture;
  if (!picture?.renderPath) return document;

  const normalizedPath = normalize(picture.renderPath);
  if (!isAbsolute(normalizedPath)) return document;

  const relativePath = relative(compileCwd, normalizedPath);
  if (
    !relativePath ||
    relativePath.startsWith("..") ||
    isAbsolute(relativePath)
  ) {
    return document;
  }

  const typstPath = relativePath.split(sep).join("/");
  if (typstPath === picture.renderPath) return document;

  return {
    ...document,
    picture: {
      ...picture,
      renderPath: typstPath,
    },
  };
}

function renderOrderedCoreSections(
  document: LatexResumeDocument,
  titles: ReturnType<typeof getLatexResumeSectionTitles>,
  metaSize: string,
): string[] {
  const sectionOrder: LatexResumeOrderedSectionKey[] =
    document.sectionOrder ?? [
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
        metaSize,
      }),
    education: () =>
      renderEntrySection({
        title: titles.education,
        entries: document.education,
        kind: "subheading",
        metaSize,
      }),
    projects: () =>
      renderEntrySection({
        title: titles.projects,
        entries: document.projects,
        kind: "project",
        metaSize,
      }),
    skills: () => renderSkillsSection(document),
    languages: () => renderLanguagesSection(document),
    interests: () => renderInterestsSection(document),
    awards: () =>
      renderEntrySection({
        title: titles.awards,
        entries: document.awards,
        kind: "subheading",
        metaSize,
      }),
    certifications: () =>
      renderEntrySection({
        title: titles.certifications,
        entries: document.certifications,
        kind: "subheading",
        metaSize,
      }),
    publications: () =>
      renderEntrySection({
        title: titles.publications,
        entries: document.publications,
        kind: "subheading",
        metaSize,
      }),
    volunteer: () =>
      renderEntrySection({
        title: titles.volunteer,
        entries: document.volunteer,
        kind: "subheading",
        metaSize,
      }),
    references: () =>
      renderEntrySection({
        title: titles.references,
        entries: document.references,
        kind: "subheading",
        metaSize,
      }),
  };

  return sectionOrder.map((key) => builders[key]());
}

export function buildTypstDocument(
  document: LatexResumeDocument,
  template: string,
  tokens: TypstThemeTokens,
  overrides?: LatexResumeStyleOverrides,
): string {
  const titles = document.sectionTitles ?? getLatexResumeSectionTitles();
  const pictureBlock = renderPictureBlock(document);
  const headlineBlock = document.headline
    ? `  #text(font: __HEADING_FONT__, size: ${tokens.headlineSize}, fill: __TEXT_COLOR__)[${escapeTypstText(document.headline)}] \\\n`
    : "";
  const locationBlock = renderLocationBlock(document);
  const contactBlock =
    document.contactItems.length > 0
      ? `  #text(size: ${tokens.contactSize})[${renderContactItems(document.contactItems)}]\n`
      : "";
  const body = [
    renderSummarySection(document),
    renderCustomFieldsSection(document),
    ...renderOrderedCoreSections(document, titles, tokens.entryMetaSize),
  ]
    .filter(Boolean)
    .join("\n\n");

  return replaceStylePlaceholders(
    replaceSharedTypstPlaceholders(template)
      .replace("__PAGE_MARGIN__", tokens.pageMargin)
      .replace("__BODY_SIZE__", tokens.bodySize)
      .replace("__PAR_LEADING__", tokens.parLeading)
      .replace("__SECTION_TOP__", tokens.sectionTop)
      .replace("__SECTION_SIZE__", tokens.sectionSize)
      .replace("__LINE_WIDTH__", tokens.lineWidth)
      .replace("__SECTION_BOTTOM__", tokens.sectionBottom)
      .replace("__NAME_SIZE__", tokens.nameSize)
      .replace("__PICTURE_BLOCK__", pictureBlock)
      .replace("__NAME__", escapeTypstText(document.name))
      .replace("__HEADLINE_BLOCK__", headlineBlock)
      .replace("__LOCATION_BLOCK__", locationBlock)
      .replace("__CONTACT_BLOCK__", contactBlock)
      .replace("__BODY__", body),
    document,
    overrides,
  );
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

export function convertDocFieldsToTypst(
  doc: LatexResumeDocument,
): LatexResumeDocument {
  const convertBullets = (bullets: string[]) =>
    bullets.map((bullet) => escapeTypstText(bullet));

  const convertEntry = (entry: LatexResumeEntry): LatexResumeEntry => ({
    ...entry,
    bullets: convertBullets(entry.bullets),
  });

  return {
    ...doc,
    summary: doc.summary ? escapeTypstText(doc.summary) : null,
    experience: doc.experience.map(convertEntry),
    education: doc.education.map(convertEntry),
    projects: doc.projects.map(convertEntry),
    awards: doc.awards.map(convertEntry),
    certifications: doc.certifications.map(convertEntry),
    publications: doc.publications.map(convertEntry),
    volunteer: doc.volunteer.map(convertEntry),
    references: doc.references.map(convertEntry),
  };
}

export const typstResumeRenderer: ResumeRenderer = {
  async render({
    document,
    outputPath,
    jobId,
    typstTheme = "classic",
    typstStyleOverrides,
  }) {
    const tempDir = await mkdtemp(join(tmpdir(), "job-ops-resume-render-"));
    const typPath = join(tempDir, "resume.typ");
    const resumeDataPath = join(tempDir, RESUME_DATA_FILENAME);
    const compiledPdfPath = join(tempDir, OUTPUT_FILENAME);

    try {
      const { manifest, template, tokens } = await loadTemplate(typstTheme);
      const renderableDocument = await materializeResumePicture(
        document,
        tempDir,
      );
      const typstDocument = normalizeTypstDocumentPicturePath(
        renderableDocument,
        tempDir,
      );
      let typst: string;
      let resumeDataDoc: LatexResumeDocument;
      if (manifest.kind === "native") {
        if (!tokens) {
          throw new Error(
            `Typst theme ${typstTheme} is missing native tokens.`,
          );
        }
        typst = buildTypstDocument(
          typstDocument,
          template,
          tokens,
          typstStyleOverrides,
        );
        resumeDataDoc = typstDocument;
      } else {
        typst = buildAdaptedTypstDocument(
          typstDocument,
          template,
          typstStyleOverrides,
        );
        resumeDataDoc = convertDocFieldsToTypst(typstDocument);
      }

      await writeFile(resumeDataPath, JSON.stringify(resumeDataDoc), "utf8");
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
  typstStyleOverrides?: LatexResumeStyleOverrides;
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
