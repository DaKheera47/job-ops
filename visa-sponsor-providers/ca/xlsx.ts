import { unzipSync } from "fflate";

// Minimal XLSX row extractor — just enough for the flat, single-sheet
// spreadsheets ESDC publishes (no formulas, no dates, shared strings +
// inline numbers). Returns rows as arrays of trimmed cell strings.

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    // Concatenate every text run so rich-text cells come out whole.
    const text = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
      .map((t) => decodeXmlEntities(t[1]))
      .join("");
    strings.push(text);
  }
  return strings;
}

function columnIndex(cellRef: string): number {
  let index = 0;
  for (const char of cellRef) {
    if (char < "A" || char > "Z") break;
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

export function extractRows(workbook: Uint8Array): string[][] {
  const files = unzipSync(workbook);
  const sheet = files["xl/worksheets/sheet1.xml"];
  if (!sheet) {
    throw new Error("XLSX has no xl/worksheets/sheet1.xml");
  }

  const decoder = new TextDecoder();
  const sharedStrings = files["xl/sharedStrings.xml"]
    ? parseSharedStrings(decoder.decode(files["xl/sharedStrings.xml"]))
    : [];

  const rows: string[][] = [];
  for (const row of decoder
    .decode(sheet)
    .matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cell of row[1].matchAll(
      /<c(?<attrs>[^>]*)>(?:[\s\S]*?<(?:v|t)[^>]*>(?<value>[\s\S]*?)<\/(?:v|t)>)?[\s\S]*?<\/c>|<c(?<attrsEmpty>[^>]*)\/>/g,
    )) {
      const attrs = cell.groups?.attrs ?? cell.groups?.attrsEmpty ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? "";
      const type = /t="([^"]+)"/.exec(attrs)?.[1];
      const raw = cell.groups?.value ?? "";
      const value =
        type === "s" && raw !== ""
          ? (sharedStrings[Number(raw)] ?? "")
          : decodeXmlEntities(raw);
      const index = ref ? columnIndex(ref) : cells.length;
      cells[index] = value.trim();
    }
    rows.push(Array.from(cells, (c) => c ?? ""));
  }

  return rows;
}
