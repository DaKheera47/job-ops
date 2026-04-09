import { normalizeResumeJsonToLatexDocument } from "./document";
import { renderLatexPdf } from "./latex";
import { normalizePreparedResumeToLatexDocument } from "./normalize";

export { normalizeResumeJsonToLatexDocument } from "./document";
export {
  getLatexTemplatePath,
  getTectonicBinary,
  readLatexTemplate,
} from "./latex";
export { normalizePreparedResumeToLatexDocument } from "./normalize";
export type * from "./types";

export async function renderResumePdf(args: {
  resumeJson: Record<string, unknown>;
  outputPath: string;
  jobId: string;
  mode?: "v4" | "v5";
}): Promise<void> {
  const document =
    args.mode === "v4"
      ? normalizePreparedResumeToLatexDocument({
          mode: "v4",
          data: args.resumeJson,
          projectCatalog: [],
          selectedProjectIds: [],
        })
      : normalizeResumeJsonToLatexDocument(args.resumeJson);
  await renderLatexPdf({
    document,
    outputPath: args.outputPath,
    jobId: args.jobId,
  });
}
