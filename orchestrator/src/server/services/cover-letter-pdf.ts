import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import { getTenantPdfDir, safeFilePart } from "@server/services/pdf-storage";
import type { Job } from "@shared/types";
import {
  renderCoverLetterPdf,
  type CoverLetterDocument,
} from "./cover-letter-renderer/latex";
import { generateCoverLetter } from "./cover-letter";
import { getProfile } from "./profile";

const coverLetterPdfLogger = logger.child({ module: "cover-letter-pdf" });

export interface CoverLetterPdfResult {
  success: boolean;
  pdfPath?: string;
  text?: string;
  error?: string;
}

export interface GenerateCoverLetterPdfOptions {
  forceRegenerate?: boolean;
}

export async function generateCoverLetterPdf(
  job: Job,
  options: GenerateCoverLetterPdfOptions = {},
): Promise<CoverLetterPdfResult> {
  try {
    if (
      !options.forceRegenerate &&
      job.coverLetterPdfPath &&
      (await fileExists(job.coverLetterPdfPath))
    ) {
      return {
        success: true,
        pdfPath: job.coverLetterPdfPath,
        text: job.coverLetterText ?? undefined,
      };
    }

    const profile = await getProfile();

    let text = options.forceRegenerate ? null : job.coverLetterText;
    if (!text || text.trim().length === 0) {
      const result = await generateCoverLetter(job, profile);
      if (!result.success || !result.text) {
        return {
          success: false,
          error: result.error ?? "Failed to generate cover letter text",
        };
      }
      text = result.text;
    }

    const personName = profile.basics?.name?.trim() || "Candidate";
    const senderEmail = profile.basics?.email?.trim() || null;
    const senderPhone = profile.basics?.phone?.trim() || null;
    const senderLocation = formatLocation(profile.basics?.location);

    const document: CoverLetterDocument = {
      senderName: personName,
      senderEmail,
      senderPhone,
      senderLocation,
      date: formatDate(new Date()),
      recipientCompany: job.employer,
      recipientRole: job.title ?? null,
      body: text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    };

    const outputDir = getTenantPdfDir();
    await mkdir(outputDir, { recursive: true });

    const namePart = safeFilePart(personName) || "candidate";
    const companyPart = safeFilePart(job.employer) || "company";
    const shortId = job.id.slice(0, 8);
    const outputPath = join(
      outputDir,
      `${namePart}_${companyPart}_${shortId}_CoverLetter.pdf`,
    );

    await renderCoverLetterPdf({ document, outputPath, jobId: job.id });

    await jobsRepo.updateJob(job.id, {
      coverLetterText: text,
      coverLetterPdfPath: outputPath,
    });

    coverLetterPdfLogger.info("Cover letter PDF generated", {
      jobId: job.id,
      outputPath,
    });

    return { success: true, pdfPath: outputPath, text };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    coverLetterPdfLogger.error("Cover letter PDF generation failed", {
      jobId: job.id,
      error: err,
    });
    return { success: false, error: message };
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatLocation(
  loc: { city?: string; region?: string; countryCode?: string } | undefined,
): string | null {
  if (!loc) return null;
  const parts = [loc.city, loc.region, loc.countryCode].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length > 0 ? parts.join(", ") : null;
}
