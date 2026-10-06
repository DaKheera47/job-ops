import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

/** Page sizes in whole PostScript points, one entry per page. */
export async function readPdfPageSizes(
  pdfPath: string,
): Promise<Array<{ width: number; height: number }>> {
  const data = new Uint8Array(await readFile(pdfPath));
  const pdf = await getDocument({ data, useSystemFonts: true }).promise;

  try {
    const sizes: Array<{ width: number; height: number }> = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const [left, bottom, right, top] = page.view;
      sizes.push({
        width: Math.round(right - left),
        height: Math.round(top - bottom),
      });
    }
    return sizes;
  } finally {
    await pdf.destroy();
  }
}
