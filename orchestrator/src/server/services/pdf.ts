/**
 * Service for generating PDF resumes from the local Design Resume when available,
 * falling back to the configured Reactive Resume base resume otherwise.
 */

import { existsSync } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
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
  convertV4ResumeToReactiveResumeV5Document,
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

async function renderRxResumePdf(args: {
  preparedResume: PreparedRxResumePdfPayload;
  outputPath: string;
  jobId: string;
  name?: string;
  requestOrigin?: string | null;
}): Promise<void> {
  const { preparedResume, outputPath, jobId } = args;
  let importedResumeId: string | null = null;
  const importData =
    preparedResume.mode === "v5"
      ? prepareReactiveResumeV5DocumentForExternalUse(preparedResume.data, {
          requestOrigin: args.requestOrigin ?? null,
        })
      : preparedResume.data;

  try {
    importedResumeId = await importRxResume(
      {
        name: args.name?.trim() || `JobOps Tailored Resume ${jobId}`,
        data: importData,
      },
      { mode: preparedResume.mode },
    );

    const downloadUrl = await exportRxResumePdf(importedResumeId, {
      mode: preparedResume.mode,
    });
    await downloadRxResumePdf(downloadUrl, outputPath);
  } finally {
    if (importedResumeId) {
      try {
        await deleteRxResume(importedResumeId, { mode: preparedResume.mode });
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

function normalizeResumeForReactiveResumeV5(args: {
  resumeData: Record<string, unknown>;
  mode: "v4" | "v5";
  requestOrigin?: string | null;
}): Record<string, unknown> {
  return (
    args.mode === "v4"
      ? convertV4ResumeToReactiveResumeV5Document(args.resumeData, {
          requestOrigin: args.requestOrigin ?? null,
        })
      : (parseV5ResumeData(args.resumeData) as Record<string, unknown>)
  ) as Record<string, unknown>;
}

async function resolveDesignResumeForRenderer(args: {
  renderer: PdfRenderer;
  requestOrigin?: string | null;
}): Promise<{
  documentId: string;
  title: string;
  data: Record<string, unknown>;
  mode: "v4" | "v5";
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
    !designResume.sourceMode
  ) {
    return {
      documentId: designResume.id,
      title: designResume.title,
      data: localDocument,
      mode: "v5",
    };
  }

  try {
    if (designResume.sourceMode !== "v5") {
      throw new Error(
        "Reactive Resume rendering now requires a v5 source resume. Reconnect Reactive Resume with v5 and re-import your Design Resume.",
      );
    }

    const upstreamResume = await getRxResume(designResume.sourceResumeId, {
      mode: designResume.sourceMode,
    });

    if (!upstreamResume.data || typeof upstreamResume.data !== "object") {
      throw new Error("Reactive Resume base resume is empty or invalid.");
    }

    const upstreamDocument = normalizeResumeForReactiveResumeV5({
      resumeData: upstreamResume.data as Record<string, unknown>,
      mode: "v5",
      requestOrigin: args.requestOrigin ?? null,
    });

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
  mode: "v4" | "v5";
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
        mode: resolved.mode,
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
  if (baseResume.mode !== "v4" && baseResume.mode !== "v5") {
    throw new Error("Reactive Resume returned an unsupported resume mode.");
  }

  if (args.renderer === "rxresume" && baseResume.mode !== "v5") {
    throw new Error(
      "Reactive Resume rendering now requires a v5 base resume. Reconnect Reactive Resume with v5 and select a v5 base resume in Settings.",
    );
  }

  return {
    data: baseResume.data as Record<string, unknown>,
    mode: baseResume.mode,
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
        mode: baseResume.mode,
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
    mode: designResume.mode,
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
