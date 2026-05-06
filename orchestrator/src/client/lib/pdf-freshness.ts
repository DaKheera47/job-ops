import type { Job, JobListItem } from "@shared/types";

type PdfFreshnessCarrier = Pick<
  Job | JobListItem,
  "pdfFreshness" | "pdfRegenerating"
>;

export const STALE_PDF_MESSAGE =
  "PDF is out of date. A new one will regenerate automatically.";

export const PDF_REGENERATING_MESSAGE =
  "PDF is being regenerated after recent changes. You can view or download it again when regeneration finishes.";

export function getPdfFreshness(
  job: PdfFreshnessCarrier | null | undefined,
): PdfFreshnessCarrier["pdfFreshness"] {
  if (job?.pdfRegenerating) return "regenerating";
  return job?.pdfFreshness ?? "missing";
}

export function isPdfStale(job: PdfFreshnessCarrier | null | undefined) {
  return getPdfFreshness(job) === "stale";
}

export function isPdfRegenerating(job: PdfFreshnessCarrier | null | undefined) {
  return getPdfFreshness(job) === "regenerating";
}

export function getPdfActionLabels(
  job: PdfFreshnessCarrier | null | undefined,
) {
  return isPdfStale(job)
    ? {
        view: "View old PDF",
        download: "Download old PDF",
      }
    : {
        view: "View PDF",
        download: "Download PDF",
      };
}
