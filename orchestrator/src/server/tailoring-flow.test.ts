import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateFinalPdf } from "./pipeline/orchestrator";
import * as jobsRepo from "./repositories/jobs";
import * as latexExportService from "./services/latex-export";
import * as pdfService from "./services/pdf";
import * as resumeExportModeService from "./services/resume-export-mode";

// Mock dependencies
vi.mock("./repositories/jobs");
vi.mock("./services/pdf");
vi.mock("./services/resume-export-mode", () => ({
  getConfiguredResumeExportMode: vi.fn().mockResolvedValue("rxresume"),
}));
vi.mock("./services/latex-export");

describe("Tailoring Flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resumeExportModeService.getConfiguredResumeExportMode).mockResolvedValue(
      "rxresume",
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
  });

  it("uses LaTeX export mode and succeeds when pdflatex is unavailable", async () => {
    vi.mocked(resumeExportModeService.getConfiguredResumeExportMode).mockResolvedValue(
      "latex",
    );
    vi.mocked(jobsRepo.getJobById).mockResolvedValue({
      id: "job-latex-789",
      title: "Platform Engineer",
      employer: "Acme Labs",
      jobDescription: "TypeScript Node.js backend role",
      suitabilityReason: "Strong backend match",
      tailoredSummary: "Tailored summary",
      tailoredHeadline: "Platform Engineer",
      tailoredSkills: JSON.stringify([
        { name: "Backend", keywords: ["TypeScript", "Node.js"] },
      ]),
      status: "discovered",
    } as any);
    vi.mocked(latexExportService.generateLatexResumeArtifacts).mockResolvedValue(
      {
        success: true,
        compileStatus: "skipped_missing_pdflatex",
        texPath: "/tmp/job-latex-789/CV_Acme_Labs.tex",
        message: "pdflatex missing",
      },
    );

    const result = await generateFinalPdf("job-latex-789");

    expect(result.success).toBe(true);
    expect(latexExportService.generateLatexResumeArtifacts).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-latex-789",
        companyName: "Acme Labs",
      }),
    );
    expect(jobsRepo.updateJob).toHaveBeenCalledWith(
      "job-latex-789",
      expect.objectContaining({
        status: "ready",
        pdfPath: "/tmp/job-latex-789/CV_Acme_Labs.tex",
      }),
    );
  });
});
