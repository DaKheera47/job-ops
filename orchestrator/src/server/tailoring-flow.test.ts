import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateFinalPdf } from "./pipeline/orchestrator";
import * as jobsRepo from "./repositories/jobs";
import * as pdfService from "./services/pdf";
import * as pdfFingerprint from "./services/pdf-fingerprint";

// Mock dependencies
vi.mock("./repositories/jobs");
vi.mock("./services/pdf");
vi.mock("./services/pdf-fingerprint", () => ({
  createJobPdfFingerprint: vi.fn().mockReturnValue("test-pdf-fingerprint"),
  resolvePdfFingerprintContext: vi.fn().mockResolvedValue({
    version: "v1",
    designResumeDocumentId: null,
    designResumeRevision: null,
    designResumeUpdatedAt: null,
    pdfRenderer: "latex",
    rxresumeBaseResumeId: null,
  }),
}));

describe("Tailoring Flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(pdfFingerprint.createJobPdfFingerprint).mockReturnValue(
      "test-pdf-fingerprint",
    );
    vi.mocked(pdfFingerprint.resolvePdfFingerprintContext).mockResolvedValue({
      version: "v1",
      designResumeDocumentId: null,
      designResumeRevision: null,
      designResumeUpdatedAt: null,
      pdfRenderer: "latex",
      rxresumeBaseResumeId: null,
    });
    vi.mocked(jobsRepo.finalizeGeneratedPdfIfCurrent).mockResolvedValue(
      {} as any,
    );
  });

  it("should use manual overrides (tailoring) when generating PDF", async () => {
    // 1. Setup: A job exists with manual tailoring applied (e.g. via the UI)
    // This simulates a job where the user has edited the summary and projects
    const tailoredJob = {
      id: "job-tailored-123",
      jobDescription: "Senior TypeScript Developer",
      status: "discovered",
      // Manual overrides:
      tailoredSummary:
        "This is a manually edited summary specifically for this job.",
      tailoredHeadline: "Manually Edited Headline",
      tailoredSkills: JSON.stringify(["React", "TypeScript", "Vitest"]),
      selectedProjectIds: "project-a,project-c", // User selected specific projects
    };

    // Mock getting the job
    vi.mocked(jobsRepo.getJobById).mockResolvedValue(tailoredJob as any);

    // Mock successful PDF generation
    vi.mocked(pdfService.generatePdf).mockResolvedValue({
      success: true,
      pdfPath: "generated/path/resume.pdf",
    });

    // 2. Action: Trigger the PDF generation
    // (This would be called when the user clicks "Generate PDF")
    const result = await generateFinalPdf("job-tailored-123");

    // 3. Assertion: The operation was successful
    expect(result.success).toBe(true);

    // 4. Critical Assertion: The PDF service was called with the MANUALLY EDITED values
    // This verifies that the user's edits are respected and not overwritten by AI defaults
    expect(pdfService.generatePdf).toHaveBeenCalledTimes(1);
    expect(pdfService.generatePdf).toHaveBeenCalledWith(
      "job-tailored-123",
      expect.objectContaining({
        summary: "This is a manually edited summary specifically for this job.",
        headline: "Manually Edited Headline",
        skills: ["React", "TypeScript", "Vitest"],
      }),
      "Senior TypeScript Developer", // Original JD
      undefined, // Deprecated profile path
      "project-a,project-c", // The manually selected projects
      expect.objectContaining({
        requestOrigin: null,
        tracerLinksEnabled: undefined,
      }),
    );
    expect(jobsRepo.finalizeGeneratedPdfIfCurrent).toHaveBeenCalledWith({
      id: "job-tailored-123",
      expectedStatus: "processing",
      requireGeneratedSource: false,
      pdfPath: "generated/path/resume.pdf",
      pdfFingerprint: "test-pdf-fingerprint",
      pdfGeneratedAt: expect.any(String),
    });
  });

  it("should fall back to defaults if no tailoring is present", async () => {
    // Setup: A job with no overrides
    const rawJob = {
      id: "job-raw-456",
      jobDescription: "Junior Java Developer",
      status: "discovered",
      // No tailored fields
    };

    vi.mocked(jobsRepo.getJobById).mockResolvedValue(rawJob as any);
    vi.mocked(pdfService.generatePdf).mockResolvedValue({
      success: true,
      pdfPath: "path.pdf",
    });

    await generateFinalPdf("job-raw-456");

    expect(pdfService.generatePdf).toHaveBeenCalledWith(
      "job-raw-456",
      expect.objectContaining({
        summary: "", // Empty if not tailored
        headline: "",
        skills: [],
      }),
      "Junior Java Developer",
      undefined, // Deprecated profile path
      undefined, // No projects selected
      expect.objectContaining({
        requestOrigin: null,
        tracerLinksEnabled: undefined,
      }),
    );
    expect(jobsRepo.finalizeGeneratedPdfIfCurrent).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "job-raw-456",
        expectedStatus: "processing",
        requireGeneratedSource: false,
      }),
    );
  });

  it("does not commit a regenerated PDF after newer job changes", async () => {
    const readyJob = {
      id: "job-ready-superseded",
      jobDescription: "Senior Product Engineer",
      status: "ready",
      pdfPath: "data/pdfs/resume_job-ready-superseded.pdf",
      pdfSource: "generated",
      tailoredSummary: "Existing tailored summary.",
      tailoredHeadline: "Existing headline",
      tailoredSkills: JSON.stringify(["React"]),
      selectedProjectIds: "project-a",
    };
    const uploadedJob = {
      ...readyJob,
      pdfSource: "uploaded",
      pdfRegenerating: true,
    };

    vi.mocked(jobsRepo.getJobById)
      .mockResolvedValueOnce(readyJob as any)
      .mockResolvedValueOnce(uploadedJob as any);
    vi.mocked(pdfService.generatePdf).mockResolvedValue({
      success: true,
      pdfPath: "generated/path/resume.pdf",
    });
    vi.mocked(jobsRepo.finalizeGeneratedPdfIfCurrent).mockResolvedValue(null);

    const result = await generateFinalPdf("job-ready-superseded");

    expect(result).toEqual({
      success: false,
      error: "PDF generation was superseded by newer job changes.",
      errorCode: "CONFLICT",
    });
    expect(jobsRepo.finalizeGeneratedPdfIfCurrent).toHaveBeenCalledWith({
      id: "job-ready-superseded",
      expectedStatus: "ready",
      requireGeneratedSource: true,
      pdfPath: "generated/path/resume.pdf",
      pdfFingerprint: "test-pdf-fingerprint",
      pdfGeneratedAt: expect.any(String),
    });
    expect(jobsRepo.updateJob).toHaveBeenLastCalledWith(
      "job-ready-superseded",
      { pdfRegenerating: false },
    );
  });

  it("keeps ready jobs ready when PDF regeneration fails", async () => {
    const readyJob = {
      id: "job-ready-789",
      jobDescription: "Senior Product Engineer",
      status: "ready",
      pdfPath: "data/pdfs/resume_job-ready-789.pdf",
      tailoredSummary: "Existing tailored summary.",
      tailoredHeadline: "Existing headline",
      tailoredSkills: JSON.stringify(["React"]),
      selectedProjectIds: "project-a",
    };

    vi.mocked(jobsRepo.getJobById).mockResolvedValue(readyJob as any);
    vi.mocked(pdfService.generatePdf).mockResolvedValue({
      success: false,
      error: "Reactive Resume API error (500): Failed to generate PDF",
      errorCode: "UPSTREAM_ERROR",
    });

    const result = await generateFinalPdf("job-ready-789");

    expect(result).toEqual({
      success: false,
      error:
        "PDF generation failed. Your previous resume PDF is still available. Reactive Resume API error (500): Failed to generate PDF",
      errorCode: "UPSTREAM_ERROR",
    });
    expect(jobsRepo.updateJob).toHaveBeenCalledTimes(2);
    expect(jobsRepo.updateJob).toHaveBeenNthCalledWith(1, "job-ready-789", {
      pdfRegenerating: true,
    });
    expect(jobsRepo.updateJob).toHaveBeenNthCalledWith(2, "job-ready-789", {
      status: "ready",
      pdfRegenerating: false,
    });
  });

  it("restores the previous status when generation throws before rendering", async () => {
    const discoveredJob = {
      id: "job-discovered-bad-skills",
      jobDescription: "Backend Developer",
      status: "discovered",
      tailoredSummary: "Summary",
      tailoredHeadline: "Headline",
      tailoredSkills: "{",
    };

    vi.mocked(jobsRepo.getJobById).mockResolvedValue(discoveredJob as any);

    const result = await generateFinalPdf("job-discovered-bad-skills");

    expect(result.success).toBe(false);
    expect(pdfService.generatePdf).not.toHaveBeenCalled();
    expect(jobsRepo.updateJob).toHaveBeenNthCalledWith(
      1,
      "job-discovered-bad-skills",
      { status: "processing", pdfRegenerating: true },
    );
    expect(jobsRepo.updateJob).toHaveBeenNthCalledWith(
      2,
      "job-discovered-bad-skills",
      { status: "discovered", pdfRegenerating: false },
    );
  });
});
