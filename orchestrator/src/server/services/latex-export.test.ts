import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { spawnSyncMock } = vi.hoisted(() => ({
  spawnSyncMock: vi.fn(),
}));

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
  default: {
    spawnSync: spawnSyncMock,
  },
}));

describe("latex-export service", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "jobops-latex-export-"));
    process.env.DATA_DIR = tempDir;
  });

  afterEach(async () => {
    delete process.env.DATA_DIR;
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("generates .tex output and marks compile skipped when pdflatex is unavailable", async () => {
    const cvTemplatePath = join(tempDir, "cv-template.tex");
    await writeFile(
      cvTemplatePath,
      String.raw`\documentclass{article}
\begin{document}
\section*{Technical Skills}
Technical Skills: React, TypeScript, CSS, Node.js\\
\begin{itemize}
\item Built dashboards with charts.
\item Implemented TypeScript backend services.
\end{itemize}
\end{document}`,
      "utf8",
    );

    const { getSetting } = await import("@server/repositories/settings");
    vi.mocked(getSetting).mockImplementation(async (key) => {
      if (key === "latexCvTemplatePath") return cvTemplatePath;
      if (key === "latexCoverTemplatePath") return null;
      return null;
    });

    spawnSyncMock.mockReturnValue({
      status: 1,
      error: { code: "ENOENT", message: "not found" },
      stdout: "",
      stderr: "",
      signal: null,
      pid: 0,
      output: [null, "", ""],
    } as any);

    const { generateLatexResumeArtifacts } = await import("./latex-export");
    const result = await generateLatexResumeArtifacts({
      jobId: "job-latex-1",
      companyName: "Acme Labs",
      jobTitle: "Backend Engineer",
      jobDescription:
        "Build TypeScript and Node.js services. Strong backend focus.",
      suitabilityReason: "Strong TypeScript and backend match.",
      tailoredSummary: "Tailored summary",
      tailoredHeadline: "Backend Engineer",
      tailoredSkills: [{ name: "Backend", keywords: ["TypeScript", "Node.js"] }],
    });

    expect(result.success).toBe(true);
    expect(result.compileStatus).toBe("skipped_missing_pdflatex");
    expect(result.pdfPath).toBeUndefined();
    expect(result.texPath).toContain("CV_Acme_Labs.tex");

    if (!result.texPath) {
      throw new Error("Expected texPath to be generated");
    }
    const rendered = await readFile(result.texPath, "utf8");
    expect(rendered).toContain("Technical Skills: TypeScript, Node.js");
    expect(rendered).toContain("\\item Implemented TypeScript backend services.");
  });
});
