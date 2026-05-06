import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import type { PdfFingerprintContext } from "./pdf-fingerprint";
import { createJobPdfFingerprint, getJobPdfFreshness } from "./pdf-fingerprint";

const context: PdfFingerprintContext = {
  version: "v1",
  designResumeDocumentId: "design-resume-1",
  designResumeRevision: 2,
  designResumeUpdatedAt: "2026-05-01T10:00:00.000Z",
  pdfRenderer: "latex",
  rxresumeBaseResumeId: "rxresume-base-1",
};

describe("PDF freshness", () => {
  it("maps missing PDFs to missing", () => {
    expect(getJobPdfFreshness(createJob(), context)).toBe("missing");
  });

  it("maps uploaded PDFs to uploaded", () => {
    expect(
      getJobPdfFreshness(
        createJob({
          pdfPath: "data/pdfs/uploaded.pdf",
          pdfSource: "uploaded",
        }),
        context,
      ),
    ).toBe("uploaded");
  });

  it("maps active PDF generation to regenerating", () => {
    expect(
      getJobPdfFreshness(
        createJob({
          pdfPath: "data/pdfs/generated.pdf",
          pdfSource: "generated",
          pdfRegenerating: true,
        }),
        context,
      ),
    ).toBe("regenerating");
  });

  it("maps generated PDFs with matching fingerprints to current", () => {
    const job = createJob({
      pdfPath: "data/pdfs/generated.pdf",
      pdfSource: "generated",
      tailoredSummary: "Summary",
    });
    const pdfFingerprint = createJobPdfFingerprint(job, context);

    expect(getJobPdfFreshness({ ...job, pdfFingerprint }, context)).toBe(
      "current",
    );
  });

  it("maps generated PDFs with mismatched fingerprints to stale", () => {
    expect(
      getJobPdfFreshness(
        createJob({
          pdfPath: "data/pdfs/generated.pdf",
          pdfSource: "generated",
          pdfFingerprint: "old-fingerprint",
        }),
        context,
      ),
    ).toBe("stale");
  });
});
