import type { PdfRenderer, TypstTheme } from "@shared/types";
import { normalizeResumeJsonToLatexDocument } from "./document";
import { renderLatexPdf } from "./latex";
import type { NormalizeResumeJsonToLatexDocumentOptions } from "./types";
import { renderTypstPdf } from "./typst";

export { normalizeResumeJsonToLatexDocument } from "./document";
export {
  getLatexTemplatePath,
  getTectonicBinary,
  readLatexTemplate,
} from "./latex";
export type * from "./types";
export {
  getTypstBinary,
  getTypstTemplatePath,
  readTypstTemplate,
} from "./typst";

type LocalPdfRenderer = Exclude<PdfRenderer, "rxresume">;

export async function renderResumePdf(args: {
  resumeJson: Record<string, unknown>;
  outputPath: string;
  jobId: string;
  language?: NormalizeResumeJsonToLatexDocumentOptions["language"];
  renderer?: LocalPdfRenderer;
  typstTheme?: TypstTheme;
}): Promise<void> {
  const document = normalizeResumeJsonToLatexDocument(args.resumeJson, {
    language: args.language,
  });
  if (args.renderer === "typst") {
    await renderTypstPdf({
      document,
      outputPath: args.outputPath,
      jobId: args.jobId,
      typstTheme: args.typstTheme,
    });
    return;
  }

  await renderLatexPdf({
    document,
    outputPath: args.outputPath,
    jobId: args.jobId,
  });
}
