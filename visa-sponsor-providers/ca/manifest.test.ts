import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";
import manifest, { parseLmiaRows, pickLatestQuarterResource } from "./manifest";
import { extractRows } from "./xlsx";

// CKAN payload mirroring the real dataset: quarters as XLSX in en/fr,
// legacy CSVs, and statistical tables that must be ignored.
const ckanPayload = {
  result: {
    resources: [
      {
        name: "2020Q3-Employers Who Were Issued a Positive Labour Market Impact Assessment",
        format: "CSV",
        language: ["en"],
        url: "https://x/2020q3.csv",
      },
      {
        name: "2025Q3-Employers Who Were Issued a Positive Labour Market Impact Assessment",
        format: "XLSX",
        language: ["en"],
        url: "https://x/2025q3_en.xlsx",
      },
      {
        name: "2025Q4-Employers Who Were Issued a Positive Labour Market Impact Assessment",
        format: "XLSX",
        language: ["fr"],
        url: "https://x/2025q4_fr.xlsx",
      },
      {
        name: "2025Q4-Employers Who Were Issued a Positive Labour Market Impact Assessment",
        format: "XLSX",
        language: ["en"],
        url: "https://x/2025q4_en.xlsx",
      },
    ],
  },
};

// A tiny real XLSX built in-memory with the ESDC sheet shape: two title rows,
// the header row, then data rows (shared strings + inline numbers).
function buildWorkbook(): Uint8Array {
  const strings = [
    "Employers who were issued a positive LMIA", // 0 title
    "Province/Territory", // 1
    "Program Stream", // 2
    "Employer", // 3
    "Address", // 4
    "Occupation", // 5
    "Approved Positions", // 6
    "Ontario", // 7
    "    High Wage", // 8
    "ACME Robotics Ltd", // 9
    "Toronto, ON M5V 2T6", // 10
    "21231-Software engineers", // 11
    "Ampersand & Co", // 12
    "Waterloo, ON N2L 3G1", // 13
  ];
  const sharedStrings = `<?xml version="1.0"?><sst>${strings
    .map(
      (s) => `<si><t xml:space="preserve">${s.replace(/&/g, "&amp;")}</t></si>`,
    )
    .join("")}</sst>`;

  const s = (ref: string, idx: number) =>
    `<c r="${ref}" t="s"><v>${idx}</v></c>`;
  const n = (ref: string, value: number) => `<c r="${ref}"><v>${value}</v></c>`;
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1">${s("A1", 0)}</row>
    <row r="2"/>
    <row r="3">${s("A3", 1)}${s("B3", 2)}${s("C3", 3)}${s("D3", 4)}${s("E3", 5)}${s("F3", 6)}</row>
    <row r="4">${s("A4", 7)}${s("B4", 8)}${s("C4", 9)}${s("D4", 10)}${s("E4", 11)}${n("F4", 3)}</row>
    <row r="5">${s("A5", 7)}${s("B5", 8)}${s("C5", 12)}${s("D5", 13)}${s("E5", 11)}${n("F5", 1)}</row>
  </sheetData></worksheet>`;

  return zipSync({
    "xl/worksheets/sheet1.xml": strToU8(sheet),
    "xl/sharedStrings.xml": strToU8(sharedStrings),
  });
}

describe("CA visa sponsor provider manifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("picks the newest English positive-LMIA XLSX quarter from CKAN", () => {
    expect(pickLatestQuarterResource(ckanPayload)).toEqual({
      url: "https://x/2025q4_en.xlsx",
      quarter: "2025Q4",
    });
  });

  it("returns null when the dataset has no matching resource", () => {
    expect(pickLatestQuarterResource({ result: { resources: [] } })).toBeNull();
    expect(pickLatestQuarterResource(null)).toBeNull();
  });

  it("extracts rows from the workbook, resolving shared strings and entities", () => {
    const rows = extractRows(buildWorkbook());

    // Self-closing empty rows are dropped by the extractor; the provider
    // locates the header by content, so alignment is irrelevant.
    expect(rows[1][2]).toBe("Employer");
    expect(rows[3][2]).toBe("Ampersand & Co");
  });

  it("parses sponsors from the sheet, mapping columns by header name", () => {
    const sponsors = parseLmiaRows(extractRows(buildWorkbook()), "2025Q4");

    expect(sponsors).toHaveLength(2);
    expect(sponsors[0]).toEqual({
      organisationName: "ACME Robotics Ltd",
      townCity: "Toronto",
      county: "Ontario",
      typeRating: "LMIA positive employer (2025Q4: 3 approved positions)",
      route: "High Wage",
    });
  });

  it("fetches CKAN, downloads the newest quarter and parses it end to end", async () => {
    const workbook = buildWorkbook();
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("package_show")) {
        return Promise.resolve(Response.json(ckanPayload));
      }
      return Promise.resolve(
        new Response(workbook.slice().buffer as ArrayBuffer),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const sponsors = await manifest.fetchSponsors();

    expect(sponsors).toHaveLength(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://x/2025q4_en.xlsx");
  });

  it("throws an actionable error when the sheet has no employer header", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("package_show")) {
        return Promise.resolve(Response.json(ckanPayload));
      }
      const empty = zipSync({
        "xl/worksheets/sheet1.xml": strToU8(
          "<worksheet><sheetData/></worksheet>",
        ),
      });
      return Promise.resolve(new Response(empty.slice().buffer as ArrayBuffer));
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(manifest.fetchSponsors()).rejects.toThrow(
      "Canada LMIA list appears empty or invalid",
    );
  });
});
