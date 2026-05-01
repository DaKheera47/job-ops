/**
 * Service for generating PDF resumes from the local Design Resume when available,
 * falling back to the configured Reactive Resume base resume otherwise.
 */

import { spawn } from "node:child_process";
import { marked } from "marked";
import puppeteer from "puppeteer";
import { existsSync } from "node:fs";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "@infra/errors";
import { logger } from "@infra/logger";
import { getSetting } from "@server/repositories/settings";
import { settingsRegistry } from "@shared/settings-registry";
import type { DesignResumePdfResponse, PdfRenderer } from "@shared/types";
import { getDataDir } from "../config/dataDir";
import { getCurrentDesignResume } from "./design-resume";
import { renderResumePdf } from "./resume-renderer";
import {
  deleteResume as deleteRxResume,
  exportResumePdf as exportRxResumePdf,
  getResume as getRxResume,
  importResume as importRxResume,
  type PreparedRxResumePdfPayload,
  prepareTailoredResumeForPdf,
} from "./rxresume";
import { getConfiguredRxResumeBaseResumeId } from "./rxresume/baseResumeId";
import {
  mergeReactiveResumeV5Content,
  prepareReactiveResumeV5DocumentForExternalUse,
} from "./rxresume/document";
import { parseV5ResumeData } from "./rxresume/schema/v5";

const OUTPUT_DIR = join(getDataDir(), "pdfs");

export interface PdfResult {
  success: boolean;
  pdfPath?: string;
  error?: string;
}

export interface TailoredPdfContent {
  summary?: string | null;
  headline?: string | null;
  skills?: Array<{ name: string; keywords: string[] }> | null;
}

export interface GeneratePdfOptions {
  tracerLinksEnabled?: boolean;
  requestOrigin?: string | null;
  tracerCompanyName?: string | null;
  tailoredResumeJson?: string | null; // Complete JSON Resume for resumed renderer
}

async function ensureOutputDir(): Promise<void> {
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
  }
}

function sanitizePdfFileName(value: string): string {
  const base = value
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9._-]+/gi, "_")
    .replace(/^_+|_+$/g, "");
  return `${base || "Design_Resume"}.pdf`;
}

async function resolvePdfRenderer(): Promise<PdfRenderer> {
  const storedValue = await getSetting("pdfRenderer");
  return (
    settingsRegistry.pdfRenderer.parse(storedValue ?? undefined) ??
    settingsRegistry.pdfRenderer.default()
  );
}

async function downloadRxResumePdf(
  url: string,
  outputPath: string,
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Reactive Resume PDF download failed with HTTP ${response.status}.`,
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  await writeFile(outputPath, bytes);
}

async function renderResumedPdf(args: {
  resumeJson: Record<string, unknown>;
  outputPath: string;
  jobId: string;
  theme?: string;
}): Promise<void> {
  const { resumeJson, outputPath, jobId, theme } = args;
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");

  const tempDir = await mkdtemp(join(tmpdir(), `job-ops-resumed-${jobId}-`));
  const jsonPath = join(tempDir, "resume.json");

  try {
    // Write JSON resume to temp file
    await writeFile(jsonPath, JSON.stringify(resumeJson, null, 2), "utf8");

    // Build resumed CLI arguments - use export command for PDF generation
    const resumedArgs = [
      "export",
      jsonPath,
      "-o",
      outputPath,
    ];
    if (theme) {
      resumedArgs.push("-t", theme);
    }

    // Run resumed CLI to generate PDF
    await new Promise<void>((resolve, reject) => {
      const child = spawn("resumed", resumedArgs, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill("SIGKILL");
        reject(new Error("resumed CLI timed out after 120s"));
      }, 120_000);

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
              "resumed CLI not found. Install with: npm install -g resumed",
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
            `resumed CLI failed with exit code ${code}. ${stderr || stdout}`,
          ),
        );
      });
    });

    logger.info("Rendered PDF via resumed CLI", { jobId, theme, outputPath });
  } catch (error) {
    logger.error("Failed to render PDF via resumed CLI", {
      jobId,
      theme,
      error,
    });
    throw error;
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(
      (cleanupError) => {
        logger.warn("Failed to cleanup temporary resumed render directory", {
          jobId,
          tempDir,
          error: cleanupError,
        });
      },
    );
  }
}

async function renderRxResumePdf(args: {
  preparedResume: PreparedRxResumePdfPayload;
  outputPath: string;
  jobId: string;
  name?: string;
  requestOrigin?: string | null;
}): Promise<void> {
  const { preparedResume, outputPath, jobId } = args;
  let importedResumeId: string | null = null;
  const importData = prepareReactiveResumeV5DocumentForExternalUse(
    preparedResume.data,
    {
      requestOrigin: args.requestOrigin ?? null,
    },
  );

  try {
    importedResumeId = await importRxResume({
      name: args.name?.trim() || `JobOps Tailored Resume ${jobId}`,
      data: importData,
    });

    const downloadUrl = await exportRxResumePdf(importedResumeId);
    if (!downloadUrl || typeof downloadUrl !== "string") {
      throw new Error(
        "Reactive Resume did not return a PDF download URL. Please ensure your Reactive Resume API key and instance URL are configured correctly in Settings.",
      );
    }
    await downloadRxResumePdf(downloadUrl, outputPath);
  } finally {
    if (importedResumeId) {
      try {
        await deleteRxResume(importedResumeId);
      } catch (error) {
        logger.warn("Failed to clean up temporary Reactive Resume PDF export", {
          jobId,
          importedResumeId,
          error,
        });
      }
    }
  }
}

async function resolveDesignResumeForRenderer(args: {
  renderer: PdfRenderer;
  requestOrigin?: string | null;
}): Promise<{
  documentId: string;
  title: string;
  data: Record<string, unknown>;
  mode: "v5";
}> {
  const designResume = await getCurrentDesignResume();
  if (!designResume?.resumeJson) {
    throw notFound("Design Resume has not been imported yet.");
  }

  const localDocument = parseV5ResumeData(
    designResume.resumeJson as Record<string, unknown>,
  ) as Record<string, unknown>;

  if (
    args.renderer !== "rxresume" ||
    !designResume.sourceResumeId ||
    designResume.sourceMode !== "v5"
  ) {
    return {
      documentId: designResume.id,
      title: designResume.title,
      data: localDocument,
      mode: "v5",
    };
  }

  try {
    const upstreamResume = await getRxResume(designResume.sourceResumeId);

    if (!upstreamResume.data || typeof upstreamResume.data !== "object") {
      throw new Error("Reactive Resume base resume is empty or invalid.");
    }

    const upstreamDocument = parseV5ResumeData(
      upstreamResume.data as Record<string, unknown>,
    ) as Record<string, unknown>;

    return {
      documentId: designResume.id,
      title: designResume.title,
      data: mergeReactiveResumeV5Content(upstreamDocument, localDocument, {
        requestOrigin: args.requestOrigin ?? null,
      }) as Record<string, unknown>,
      mode: "v5",
    };
  } catch (error) {
    logger.warn(
      "Failed to refresh Reactive Resume template metadata for Design Resume rendering",
      {
        documentId: designResume.id,
        sourceResumeId: designResume.sourceResumeId,
        sourceMode: designResume.sourceMode,
        error,
      },
    );

    return {
      documentId: designResume.id,
      title: designResume.title,
      data: localDocument,
      mode: "v5",
    };
  }
}

async function loadBaseResumeSource(args: {
  renderer: PdfRenderer;
  requestOrigin?: string | null;
}): Promise<{
  data: Record<string, unknown>;
  mode: "v5";
}> {
  const designResume = await getCurrentDesignResume();
  if (designResume?.resumeJson) {
    if (args.renderer === "rxresume") {
      const resolved = await resolveDesignResumeForRenderer({
        renderer: args.renderer,
        requestOrigin: args.requestOrigin ?? null,
      });
      return {
        data: resolved.data,
        mode: "v5",
      };
    }

    return {
      data: parseV5ResumeData(
        designResume.resumeJson as Record<string, unknown>,
      ) as Record<string, unknown>,
      mode: "v5",
    };
  }

  const { resumeId: baseResumeId } = await getConfiguredRxResumeBaseResumeId();
  if (!baseResumeId) {
    throw new Error(
      "No Design Resume found, and no Reactive Resume base resume is configured. Import a Design Resume or select a base resume in Settings.",
    );
  }

  const baseResume = await getRxResume(baseResumeId);
  if (!baseResume.data || typeof baseResume.data !== "object") {
    throw new Error("Reactive Resume base resume is empty or invalid.");
  }

  return {
    data: baseResume.data as Record<string, unknown>,
    mode: "v5",
  };
}

/**
 * Generate a tailored PDF resume for a job using the configured resume source.
 *
 * Flow:
 * 1. Prepare resume data with tailored content and project selection
 * 2. Normalize the tailored resume into the renderer document model
 * 3. Render a PDF with the active renderer
 */
export async function generatePdf(
  jobId: string,
  tailoredContent: TailoredPdfContent,
  jobDescription: string,
  _baseResumePath?: string, // Deprecated: now always uses Design Resume or the configured Reactive Resume base resume
  selectedProjectIds?: string | null,
  options?: GeneratePdfOptions,
): Promise<PdfResult> {
  let renderer: PdfRenderer | null = null;

  try {
    renderer = await resolvePdfRenderer();
    logger.info("Generating PDF resume", { jobId, renderer });

    // Ensure output directory exists
    await ensureOutputDir();

    const baseResume = await loadBaseResumeSource({
      renderer,
      requestOrigin: options?.requestOrigin ?? null,
    });

    let preparedResume: Awaited<
      ReturnType<typeof prepareTailoredResumeForPdf>
    > | null = null;
    try {
      preparedResume = await prepareTailoredResumeForPdf({
        resumeData: baseResume.data,
        tailoredContent,
        jobDescription,
        selectedProjectIds,
        jobId,
        tracerLinks: {
          enabled: Boolean(options?.tracerLinksEnabled),
          requestOrigin: options?.requestOrigin ?? null,
          companyName: options?.tracerCompanyName ?? null,
        },
      });
    } catch (err) {
      logger.warn("Resume tailoring step failed during PDF generation", {
        jobId,
        error: err,
      });
      throw err;
    }

    const outputPath = join(OUTPUT_DIR, `resume_${jobId}.pdf`);
    if (renderer === "latex") {
      await renderResumePdf({
        resumeJson: preparedResume.data,
        outputPath,
        jobId,
      });
    } else if (renderer === "resumed") {
      const themeValue = await getSetting("jsonResumeTheme");
      const theme =
        settingsRegistry.jsonResumeTheme.parse(themeValue ?? undefined) ??
        settingsRegistry.jsonResumeTheme.default();
      
      // Use complete tailoredResumeJson if available, otherwise use prepared resume
      let resumeJson = preparedResume.data;
      if (options?.tailoredResumeJson) {
        try {
          resumeJson = JSON.parse(options.tailoredResumeJson) as Record<string, unknown>;
          logger.info("Using complete tailoredResumeJson for resumed renderer", { jobId });
        } catch (error) {
          logger.warn("Failed to parse tailoredResumeJson, using prepared resume", { jobId, error });
        }
      }
      
      // Ensure JSON Resume schema compatibility for resumed CLI
      if (Array.isArray(resumeJson.work)) {
        resumeJson.work = resumeJson.work.map((entry: any) => {
          if (entry && typeof entry === "object") {
            if (entry.company && !entry.name) {
              entry.name = entry.company;
            }
            if (typeof entry.endDate === "string" && entry.endDate.toLowerCase() === "present") {
              entry.endDate = "";
            }
          }
          return entry;
        });
      }

      await renderResumedPdf({
        resumeJson,
        outputPath,
        jobId,
        theme,
      });
    } else {
      await renderRxResumePdf({
        preparedResume,
        outputPath,
        jobId,
        requestOrigin: options?.requestOrigin ?? null,
      });
    }

    logger.info("PDF generated successfully", { jobId, outputPath, renderer });
    return { success: true, pdfPath: outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("PDF generation failed", { jobId, renderer, error });
    return { success: false, error: message };
  }
}

export async function generateDesignResumePdf(options?: {
  requestOrigin?: string | null;
}): Promise<DesignResumePdfResponse> {
  const renderer = await resolvePdfRenderer();
  const designResume = await resolveDesignResumeForRenderer({
    renderer,
    requestOrigin: options?.requestOrigin ?? null,
  });
  const generatedAt = new Date().toISOString();
  const outputFileName = "design_resume_current.pdf";
  const outputPath = join(OUTPUT_DIR, outputFileName);
  const preparedResume: PreparedRxResumePdfPayload = {
    mode: "v5",
    data: structuredClone(designResume.data) as Record<string, unknown>,
    projectCatalog: [],
    selectedProjectIds: [],
  };

  await ensureOutputDir();

  logger.info("Generating Design Resume PDF", {
    renderer,
    documentId: designResume.documentId,
  });

  if (renderer === "latex") {
    await renderResumePdf({
      resumeJson: designResume.data,
      outputPath,
      jobId: "design-resume",
    });
  } else {
    await renderRxResumePdf({
      preparedResume,
      outputPath,
      jobId: "design-resume",
      name: designResume.title,
      requestOrigin: options?.requestOrigin ?? null,
    });
  }

  return {
    fileName: sanitizePdfFileName(designResume.title),
    pdfUrl: `/pdfs/${outputFileName}?v=${encodeURIComponent(generatedAt)}`,
    generatedAt,
  };
}

/**
 * Check if a PDF exists for a job.
 */
export async function pdfExists(jobId: string): Promise<boolean> {
  const pdfPath = join(OUTPUT_DIR, `resume_${jobId}.pdf`);
  try {
    await access(pdfPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the path to a job's PDF.
 */
export function getPdfPath(jobId: string): string {
  return join(OUTPUT_DIR, `resume_${jobId}.pdf`);
}

/**
 * Generate a Cover Letter PDF from markdown content.
 */
export async function generateCoverLetterPdf(jobId: string, markdown: string): Promise<PdfResult> {
  try {
    await ensureOutputDir();
    const outputPath = join(OUTPUT_DIR, `cover_letter_${jobId}.pdf`);

    const htmlContent = await marked.parse(markdown);

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              font-size: 11pt;
              line-height: 1.5;
              color: #333;
              margin: 0;
              padding: 0;
            }
            .content {
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            p { margin-bottom: 1em; }
          </style>
        </head>
        <body>
          <div class="content">
            ${htmlContent}
          </div>
        </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });
    
    await page.pdf({
      path: outputPath,
      format: "A4",
      printBackground: true,
      margin: {
        top: "20px",
        right: "20px",
        bottom: "20px",
        left: "20px",
      }
    });

    await browser.close();

    logger.info("Cover letter PDF generated successfully", { jobId, outputPath });
    return { success: true, pdfPath: outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Cover letter PDF generation failed", { jobId, error });
    return { success: false, error: message };
  }
}
