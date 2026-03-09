import { existsSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { logger } from "@infra/logger";
import { getDataDir } from "@server/config/dataDir";
import { getSetting } from "@server/repositories/settings";
import { tailorLatexTemplate } from "./latex-tailoring";

type TailoredSkill = { name: string; keywords: string[] };

export type LatexCompileStatus =
  | "compiled"
  | "skipped_missing_pdflatex"
  | "failed";

export type LatexExportResult = {
  success: boolean;
  compileStatus: LatexCompileStatus;
  texPath?: string;
  coverTexPath?: string;
  pdfPath?: string;
  coverPdfPath?: string;
  message?: string;
  error?: string;
};

export type LatexTemplateValidationResult = {
  valid: boolean;
  message: string | null;
  cvTemplatePath: string | null;
  coverTemplatePath: string | null;
  pdflatexAvailable: boolean;
};

const LATEX_OUTPUT_ROOT = join(getDataDir(), "pdfs", "latex");

function normalizeString(input: string | null | undefined): string | null {
  const value = input?.trim();
  return value ? value : null;
}

function sanitizePathSegment(value: string): string {
  const normalized = value
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "Company";
}

function isMissingBinaryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

function hasPdflatex(): boolean {
  const result = spawnSync("pdflatex", ["--version"], {
    encoding: "utf8",
    stdio: "ignore",
  });

  if (result.error && isMissingBinaryError(result.error)) return false;
  return result.status === 0;
}

function compileTexFile(args: {
  texPath: string;
  outputDir: string;
}): { success: boolean; pdfPath: string; error?: string } {
  const run = spawnSync(
    "pdflatex",
    [
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-output-directory",
      args.outputDir,
      args.texPath,
    ],
    {
      encoding: "utf8",
    },
  );

  const pdfPath = args.texPath.replace(/\.tex$/i, ".pdf");
  if (run.error) {
    const errorMessage = run.error.message || "Unknown pdflatex error";
    return { success: false, pdfPath, error: errorMessage };
  }
  if (run.status !== 0) {
    const stderr = run.stderr?.trim() || run.stdout?.trim() || "pdflatex failed";
    return { success: false, pdfPath, error: stderr.slice(0, 500) };
  }
  if (!existsSync(pdfPath)) {
    return {
      success: false,
      pdfPath,
      error: "pdflatex completed without producing a PDF file",
    };
  }
  return { success: true, pdfPath };
}

async function readTemplate(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function resolveLatexTemplatePaths(
  overrides?: { cvTemplatePath?: string | null; coverTemplatePath?: string | null },
): Promise<{
  cvTemplatePath: string | null;
  coverTemplatePath: string | null;
}> {
  const [storedCvPath, storedCoverPath] = await Promise.all([
    getSetting("latexCvTemplatePath"),
    getSetting("latexCoverTemplatePath"),
  ]);

  const cvTemplatePath = normalizeString(
    overrides?.cvTemplatePath ??
      storedCvPath ??
      process.env.LATEX_CV_TEMPLATE_PATH ??
      null,
  );
  const coverTemplatePath = normalizeString(
    overrides?.coverTemplatePath ??
      storedCoverPath ??
      process.env.LATEX_COVER_TEMPLATE_PATH ??
      null,
  );

  return { cvTemplatePath, coverTemplatePath };
}

export async function validateLatexTemplateConfig(
  overrides?: { cvTemplatePath?: string | null; coverTemplatePath?: string | null },
): Promise<LatexTemplateValidationResult> {
  const { cvTemplatePath, coverTemplatePath } =
    await resolveLatexTemplatePaths(overrides);

  if (!cvTemplatePath) {
    return {
      valid: false,
      message:
        "LATEX_CV_TEMPLATE_PATH is required when LaTeX export mode is enabled.",
      cvTemplatePath,
      coverTemplatePath,
      pdflatexAvailable: hasPdflatex(),
    };
  }

  try {
    await access(cvTemplatePath);
  } catch {
    return {
      valid: false,
      message: `CV template path is not readable: ${cvTemplatePath}`,
      cvTemplatePath,
      coverTemplatePath,
      pdflatexAvailable: hasPdflatex(),
    };
  }

  if (coverTemplatePath) {
    try {
      await access(coverTemplatePath);
    } catch {
      return {
        valid: false,
        message: `Cover template path is not readable: ${coverTemplatePath}`,
        cvTemplatePath,
        coverTemplatePath,
        pdflatexAvailable: hasPdflatex(),
      };
    }
  }

  const pdflatexAvailable = hasPdflatex();
  const message = pdflatexAvailable
    ? "LaTeX template paths are valid."
    : "Template paths are valid, but pdflatex is unavailable. .tex files will still be generated.";

  return {
    valid: true,
    message,
    cvTemplatePath,
    coverTemplatePath,
    pdflatexAvailable,
  };
}

function flattenTailoredSkills(skills: TailoredSkill[] | null | undefined): string {
  if (!skills) return "";
  return skills
    .flatMap((group) => group.keywords ?? [])
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .join(", ");
}

export async function generateLatexResumeArtifacts(args: {
  jobId: string;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  suitabilityReason?: string | null;
  tailoredSummary?: string | null;
  tailoredHeadline?: string | null;
  tailoredSkills?: TailoredSkill[] | null;
}): Promise<LatexExportResult> {
  logger.info("Generating resume artifacts in LaTeX mode", {
    jobId: args.jobId,
    companyName: args.companyName,
  });

  const validation = await validateLatexTemplateConfig();
  if (!validation.valid || !validation.cvTemplatePath) {
    return {
      success: false,
      compileStatus: "failed",
      error: validation.message ?? "LaTeX template configuration is invalid.",
    };
  }

  const companySafe = sanitizePathSegment(args.companyName);
  const outputDir = join(LATEX_OUTPUT_ROOT, args.jobId);
  const cvTexPath = join(outputDir, `CV_${companySafe}.tex`);
  const coverTexPath = join(outputDir, `Cover_${companySafe}.tex`);

  try {
    await mkdir(outputDir, { recursive: true });
    const cvTemplate = await readTemplate(validation.cvTemplatePath);
    const coverTemplate = validation.coverTemplatePath
      ? await readTemplate(validation.coverTemplatePath)
      : null;

    const keywordContext = [
      args.jobTitle,
      args.jobDescription,
      args.suitabilityReason ?? "",
      args.tailoredSummary ?? "",
      args.tailoredHeadline ?? "",
      flattenTailoredSkills(args.tailoredSkills),
    ]
      .filter(Boolean)
      .join("\n");

    const substitutions = {
      JOB_ID: args.jobId,
      COMPANY: args.companyName,
      JOB_TITLE: args.jobTitle,
      TAILORED_SUMMARY: args.tailoredSummary ?? "",
      TAILORED_HEADLINE: args.tailoredHeadline ?? "",
      TAILORED_SKILLS: flattenTailoredSkills(args.tailoredSkills),
    };

    const tailoredCv = tailorLatexTemplate({
      template: cvTemplate,
      keywordContext,
      substitutions,
    });
    await writeFile(cvTexPath, tailoredCv.content, "utf8");

    let writtenCoverTexPath: string | undefined;
    if (coverTemplate) {
      const tailoredCover = tailorLatexTemplate({
        template: coverTemplate,
        keywordContext,
        substitutions,
      });
      await writeFile(coverTexPath, tailoredCover.content, "utf8");
      writtenCoverTexPath = coverTexPath;
    }

    if (!validation.pdflatexAvailable) {
      const message =
        "pdflatex is not available. Generated .tex artifacts only; no PDF compiled.";
      logger.warn("LaTeX export generated without PDF compilation", {
        jobId: args.jobId,
        outputDir,
      });
      return {
        success: true,
        compileStatus: "skipped_missing_pdflatex",
        texPath: cvTexPath,
        coverTexPath: writtenCoverTexPath,
        message,
      };
    }

    const cvCompile = compileTexFile({ texPath: cvTexPath, outputDir });
    if (!cvCompile.success) {
      logger.error("LaTeX CV compilation failed", {
        jobId: args.jobId,
        texPath: cvTexPath,
        error: cvCompile.error,
      });
      return {
        success: false,
        compileStatus: "failed",
        texPath: cvTexPath,
        coverTexPath: writtenCoverTexPath,
        error: cvCompile.error ?? "Failed to compile LaTeX CV.",
      };
    }

    let coverPdfPath: string | undefined;
    if (writtenCoverTexPath) {
      const coverCompile = compileTexFile({
        texPath: writtenCoverTexPath,
        outputDir,
      });
      if (coverCompile.success) {
        coverPdfPath = coverCompile.pdfPath;
      } else {
        logger.warn("LaTeX cover compilation failed", {
          jobId: args.jobId,
          texPath: writtenCoverTexPath,
          error: coverCompile.error,
        });
      }
    }

    logger.info("LaTeX resume artifacts generated", {
      jobId: args.jobId,
      texPath: cvTexPath,
      pdfPath: cvCompile.pdfPath,
      compileStatus: "compiled",
    });

    return {
      success: true,
      compileStatus: "compiled",
      texPath: cvTexPath,
      coverTexPath: writtenCoverTexPath,
      pdfPath: cvCompile.pdfPath,
      coverPdfPath,
      message: "LaTeX artifacts generated successfully.",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown LaTeX export error";
    logger.error("LaTeX export failed", {
      jobId: args.jobId,
      error,
    });
    return {
      success: false,
      compileStatus: "failed",
      texPath: cvTexPath,
      error: message,
    };
  }
}
