import { spawn } from "node:child_process";
import { copyFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "@infra/logger";

const TECTONIC_TIMEOUT_MS = 120_000;
const OUTPUT_FILENAME = "cover-letter.pdf";

const coverLetterLogger = logger.child({ module: "cover-letter-renderer" });

export interface CoverLetterDocument {
  senderName: string;
  senderEmail?: string | null;
  senderPhone?: string | null;
  senderLocation?: string | null;
  date: string;
  recipientCompany: string;
  recipientRole?: string | null;
  body: string[];
  greeting?: string;
  closing?: string;
}

export interface RenderCoverLetterArgs {
  document: CoverLetterDocument;
  outputPath: string;
  jobId: string;
}

export async function renderCoverLetterPdf(
  args: RenderCoverLetterArgs,
): Promise<void> {
  const { document, outputPath, jobId } = args;
  const tempDir = await mkdtemp(
    join(tmpdir(), `job-ops-cover-letter-${jobId}-`),
  );
  const texPath = join(tempDir, "cover-letter.tex");
  const compiledPdfPath = join(tempDir, OUTPUT_FILENAME);

  try {
    const latex = buildLatexDocument(document);
    await writeFile(texPath, latex, "utf8");
    await runTectonic({ cwd: tempDir, texPath, jobId });
    await copyFile(compiledPdfPath, outputPath);
    coverLetterLogger.info("Rendered cover letter PDF", { jobId, outputPath });
  } catch (error) {
    coverLetterLogger.error("Failed to render cover letter PDF", {
      jobId,
      outputPath,
      error,
    });
    throw error;
  }
}

function buildLatexDocument(doc: CoverLetterDocument): string {
  const senderName = escapeLatex(doc.senderName);
  const contactParts = [
    doc.senderEmail ? escapeLatex(doc.senderEmail) : "",
    doc.senderPhone ? escapeLatex(doc.senderPhone) : "",
    doc.senderLocation ? escapeLatex(doc.senderLocation) : "",
  ].filter(Boolean);
  const contactLine = contactParts.join(" \\textbar{} ");
  const date = escapeLatex(doc.date);
  const recipient = escapeLatex(doc.recipientCompany);
  const greeting = escapeLatex(doc.greeting?.trim() || "Dear Hiring Team,");
  const closing = escapeLatex(doc.closing?.trim() || "Sincerely,");

  const paragraphs = doc.body
    .map((p) => escapeLatex(p.trim()))
    .filter((p) => p.length > 0)
    .join("\n\n");

  return `\\documentclass[11pt,a4paper]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{microtype}
\\usepackage[utf8]{inputenc}
\\usepackage{parskip}
\\setlength{\\parskip}{0.6em}
\\setlength{\\parindent}{0pt}
\\pagenumbering{gobble}

\\begin{document}

\\begin{flushright}
{\\Large\\textbf{${senderName}}}\\\\
${contactLine}
\\end{flushright}

\\vspace{0.5em}
${date}

\\vspace{1em}
${recipient}

\\vspace{1em}
${greeting}

\\vspace{0.4em}
${paragraphs}

\\vspace{1em}
${closing}\\\\
${senderName}

\\end{document}
`;
}

function escapeLatex(input: string): string {
  if (!input) return "";
  return input
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}")
    .replace(/</g, "\\textless{}")
    .replace(/>/g, "\\textgreater{}");
}

async function runTectonic(args: {
  cwd: string;
  texPath: string;
  jobId: string;
}): Promise<void> {
  const binary = process.env.TECTONIC_BIN?.trim() || "tectonic";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, ["--outdir", args.cwd, args.texPath], {
      cwd: args.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new Error(
          `Tectonic timed out after ${TECTONIC_TIMEOUT_MS / 1000}s while rendering cover letter PDF.`,
        ),
      );
    }, TECTONIC_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `Tectonic binary not found. Install tectonic or set TECTONIC_BIN to the executable path.`,
          ),
        );
        return;
      }
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `Tectonic failed with exit code ${code ?? "unknown"}. ${truncateOutput(stderr || stdout)}`,
        ),
      );
    });
  }).catch((error) => {
    coverLetterLogger.warn("LaTeX cover letter compile failed", {
      jobId: args.jobId,
      error,
      compiler: binary,
    });
    throw error;
  });
}

function truncateOutput(text: string, maxLen = 600): string {
  if (!text) return "";
  const trimmed = text.trim();
  return trimmed.length <= maxLen
    ? trimmed
    : `${trimmed.slice(0, maxLen)}…`;
}
