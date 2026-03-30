/**
 * Service for generating PDF resumes from tailored Reactive Resume data.
 */

import { existsSync } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@infra/logger";
import { getDataDir } from "../config/dataDir";
import { renderResumePdf } from "./resume-renderer";
import {
  getResume as getRxResume,
  prepareTailoredResumeForPdf,
} from "./rxresume";
import { getConfiguredRxResumeBaseResumeId } from "./rxresume/baseResumeId";

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

/**
 * Generate a tailored PDF resume for a job using the configured resume source.
 *
 * Flow:
 * 1. Prepare resume data with tailored content and project selection
 * 2. Normalize the tailored resume into the renderer document model
 * 3. Render a PDF locally with the active renderer
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

  try {
    // Ensure output directory exists
    if (!existsSync(OUTPUT_DIR)) {
      await mkdir(OUTPUT_DIR, { recursive: true });
    }

    const { resumeId: baseResumeId } =
      await getConfiguredRxResumeBaseResumeId();
    if (!baseResumeId) {
      throw new Error(
        "Base resume not configured. Please select a base resume from your Reactive Resume account in Settings.",
      );
    }
    const baseResume = await getRxResume(baseResumeId);
    if (!baseResume.data || typeof baseResume.data !== "object") {
      throw new Error("Reactive Resume base resume is empty or invalid.");
    }

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
    await renderResumePdf({
      preparedResume,
      outputPath,
      jobId,
    });

    logger.info("PDF generated successfully", { jobId, outputPath });
    return { success: true, pdfPath: outputPath };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
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
