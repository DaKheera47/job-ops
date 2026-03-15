/**
 * Service for generating PDF resumes using Reactive Resume.
 */

import { createWriteStream, existsSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { logger } from "@infra/logger";
import { getDataDir } from "../config/dataDir";
import {
  createDerivedVariantFromJob,
  markDerivedVariantFailed,
  markDerivedVariantReady,
} from "./platform/resumeVariants";
import {
  deleteResume as deleteRemoteResume,
  exportResumePdf,
  importResume as importRemoteResume,
  prepareTailoredResumeForPdf,
} from "./rxresume";

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
  workspaceId?: string;
  profileId?: string;
}

/**
 * Download a file from a URL and save it to a local path.
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download PDF: HTTP ${response.status} ${response.statusText}`,
    );
  }

  if (!response.body) {
    throw new Error("No response body from PDF download");
  }

  // Convert Web ReadableStream to Node readable
  // biome-ignore lint/suspicious/noExplicitAny: response.body is a ReadableStream in the browser environment, but Node.js fetch implementation might have slight differences in types.
  const nodeReadable = Readable.fromWeb(response.body as any);
  const fileStream = createWriteStream(outputPath);

  await pipeline(nodeReadable, fileStream);
}

/**
 * Generate a tailored PDF resume for a job using Reactive Resume.
 *
 * Flow:
 * 1. Prepare resume data with tailored content and project selection
 * 2. Import/create resume on Reactive Resume
 * 3. Request print to get PDF URL
 * 4. Download PDF locally
 * 5. Delete temporary resume from Reactive Resume
 */
export async function generatePdf(
  jobId: string,
  tailoredContent: TailoredPdfContent,
  jobDescription: string,
  _baseResumePath?: string, // Deprecated: now always uses configured Reactive Resume base resume
  selectedProjectIds?: string | null,
  options?: GeneratePdfOptions,
): Promise<PdfResult> {
  logger.info("Generating PDF resume", { jobId });
  let variantId: string | null = null;

  try {
    // Ensure output directory exists
    if (!existsSync(OUTPUT_DIR)) {
      await mkdir(OUTPUT_DIR, { recursive: true });
    }

    const variantContext = await createDerivedVariantFromJob(
      jobId,
      options?.profileId,
      {
        workspaceId: options?.workspaceId,
      },
    );
    variantId = variantContext.variant.id;
    const baseResume = variantContext.resume;
    if (!baseResume.data || typeof baseResume.data !== "object") {
      throw new Error("Canonical resume data is empty or invalid.");
    }

    let preparedResumeData: Record<string, unknown>;
    try {
      const prepared = await prepareTailoredResumeForPdf({
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
      preparedResumeData = prepared.data;
    } catch (err) {
      logger.warn("Resume tailoring step failed during PDF generation", {
        jobId,
        error: err,
      });
      throw err;
    }

    const outputPath = join(OUTPUT_DIR, `resume_${jobId}.pdf`);
    let resumeId: string | null = null;
    try {
      logger.debug("Uploading temporary resume for PDF generation", { jobId });
      resumeId = await importRemoteResume({
        data: preparedResumeData,
        name: `JobOps Tailored Resume ${jobId}`,
        slug: "",
      });

      logger.debug("Requesting PDF export for temporary resume", {
        jobId,
        resumeId,
      });
      const pdfUrl = await exportResumePdf(resumeId);

      logger.debug("Downloading generated PDF", { jobId, resumeId });
      await downloadFile(pdfUrl, outputPath);
      await deleteRemoteResume(resumeId);
      resumeId = null;
    } finally {
      if (resumeId) {
        try {
          await deleteRemoteResume(resumeId);
        } catch (cleanupError) {
          logger.warn("Failed to cleanup temporary Reactive Resume record", {
            jobId,
            resumeId,
            error: cleanupError,
          });
        }
      }
    }

    logger.info("PDF generated successfully", { jobId, outputPath });
    if (variantId) {
      await markDerivedVariantReady(variantId, outputPath);
    }
    return { success: true, pdfPath: outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (variantId) {
      await markDerivedVariantFailed(variantId);
    }
    logger.error("PDF generation failed", { jobId, error });
    return { success: false, error: message };
  }
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
