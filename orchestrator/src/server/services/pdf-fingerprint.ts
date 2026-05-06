import { createHash } from "node:crypto";
import * as settingsRepo from "@server/repositories/settings";
import { settingsRegistry } from "@shared/settings-registry";
import type { Job, JobPdfFreshness, PdfRenderer } from "@shared/types";
import { getCurrentDesignResumeOrNullOnLegacy } from "./design-resume";
import { getConfiguredRxResumeBaseResumeId } from "./rxresume/baseResumeId";

const PDF_FINGERPRINT_VERSION = "v1";

export interface PdfFingerprintContext {
  version: typeof PDF_FINGERPRINT_VERSION;
  designResumeDocumentId: string | null;
  designResumeRevision: number | null;
  designResumeUpdatedAt: string | null;
  pdfRenderer: PdfRenderer;
  rxresumeBaseResumeId: string | null;
}

export async function resolvePdfFingerprintContext(): Promise<PdfFingerprintContext> {
  const [designResume, rawRenderer, configuredBaseResume] = await Promise.all([
    getCurrentDesignResumeOrNullOnLegacy(),
    settingsRepo.getSetting("pdfRenderer"),
    getConfiguredRxResumeBaseResumeId(),
  ]);

  const parsedRenderer = settingsRegistry.pdfRenderer.parse(
    rawRenderer ?? undefined,
  );

  return {
    version: PDF_FINGERPRINT_VERSION,
    designResumeDocumentId: designResume?.id ?? null,
    designResumeRevision: designResume?.revision ?? null,
    designResumeUpdatedAt: designResume?.updatedAt ?? null,
    pdfRenderer: parsedRenderer ?? settingsRegistry.pdfRenderer.default(),
    rxresumeBaseResumeId: configuredBaseResume.resumeId ?? null,
  };
}

export function createJobPdfFingerprint(
  job: Pick<
    Job,
    | "tailoredSummary"
    | "tailoredHeadline"
    | "tailoredSkills"
    | "selectedProjectIds"
    | "jobDescription"
    | "tracerLinksEnabled"
    | "employer"
  >,
  context: PdfFingerprintContext,
): string {
  const payload = {
    version: context.version,
    renderer: context.pdfRenderer,
    rxresumeBaseResumeId: context.rxresumeBaseResumeId,
    designResumeDocumentId: context.designResumeDocumentId,
    designResumeRevision: context.designResumeRevision,
    designResumeUpdatedAt: context.designResumeUpdatedAt,
    job: {
      tailoredSummary: job.tailoredSummary ?? null,
      tailoredHeadline: job.tailoredHeadline ?? null,
      tailoredSkills: job.tailoredSkills ?? null,
      selectedProjectIds: job.selectedProjectIds ?? null,
      jobDescription: job.jobDescription ?? null,
      tracerLinksEnabled: Boolean(job.tracerLinksEnabled),
      employer: job.employer ?? null,
    },
  };

  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function getJobPdfFreshness(
  job: Pick<
    Job,
    | "pdfPath"
    | "pdfSource"
    | "pdfRegenerating"
    | "pdfFingerprint"
    | "tailoredSummary"
    | "tailoredHeadline"
    | "tailoredSkills"
    | "selectedProjectIds"
    | "jobDescription"
    | "tracerLinksEnabled"
    | "employer"
  >,
  context: PdfFingerprintContext,
): JobPdfFreshness {
  if (job.pdfRegenerating) return "regenerating";
  if (!job.pdfPath) return "missing";
  if (job.pdfSource === "uploaded") return "uploaded";
  if (job.pdfSource !== "generated") return "missing";

  const nextFingerprint = createJobPdfFingerprint(job, context);
  return job.pdfFingerprint === nextFingerprint ? "current" : "stale";
}

export function applyJobPdfFreshness<T extends Job>(
  job: T,
  context: PdfFingerprintContext,
): T {
  return {
    ...job,
    pdfFreshness: getJobPdfFreshness(job, context),
  };
}

export function applyJobsPdfFreshness<T extends Job>(
  jobs: T[],
  context: PdfFingerprintContext,
): T[] {
  return jobs.map((job) => applyJobPdfFreshness(job, context));
}
