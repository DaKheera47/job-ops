import type { PreparedRxResumePdfPayload } from "@server/services/rxresume";
import { renderLatexPdf } from "./latex";
import { normalizePreparedResumeToLatexDocument } from "./normalize";

export {
  getLatexTemplatePath,
  getTectonicBinary,
  readLatexTemplate,
} from "./latex";
export { normalizePreparedResumeToLatexDocument } from "./normalize";
export type * from "./types";

export async function renderResumePdf(args: {
  preparedResume: PreparedRxResumePdfPayload;
  outputPath: string;
  jobId: string;
}): Promise<void> {
  const document = normalizePreparedResumeToLatexDocument(args.preparedResume);
  await renderLatexPdf({
    document,
    outputPath: args.outputPath,
    jobId: args.jobId,
  });
}
