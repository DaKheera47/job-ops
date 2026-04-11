import { normalizeResumeJsonToLatexDocument } from "./document";
import { renderLatexPdf } from "./latex";

export { normalizeResumeJsonToLatexDocument } from "./document";
export {
  getLatexTemplatePath,
  getTectonicBinary,
  readLatexTemplate,
} from "./latex";
export type * from "./types";

export async function renderResumePdf(args: {
  resumeJson: Record<string, unknown>;
  outputPath: string;
  jobId: string;
}): Promise<void> {
  const document = normalizeResumeJsonToLatexDocument(args.resumeJson);
  await renderLatexPdf({
    document,
    outputPath: args.outputPath,
    jobId: args.jobId,
  });
}
