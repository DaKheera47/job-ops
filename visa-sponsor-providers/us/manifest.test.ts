import { afterEach, describe, expect, it, vi } from "vitest";
import manifest, { parseH1bExport } from "./manifest";

// Mirrors the real USCIS Data Hub export header and quirks (verified
// 2026-07-11): rows with an empty employer, one row per NAICS code for the
// same employer, quoted names.
const exportCsv = [
  '"Fiscal Year",Employer,"Initial Approval","Initial Denial","Continuing Approval","Continuing Denial",NAICS,"Tax ID",State,City,ZIP',
  "2023,,1,0,0,0,51,8070,DE,WILMINGTON,19801",
  '2023,"ACME ROBOTICS INC",2,0,3,1,51,1234,WA,SEATTLE,98101',
  '2023,"ACME ROBOTICS INC",1,0,0,0,54,1234,WA,SEATTLE,98101',
  '2023,"DENIED ONLY LLC",0,2,0,1,51,9999,TX,AUSTIN,78701',
  '2023,"1 800 CONTACTS INC",0,0,1,0,42,1643,,,',
].join("\n");

describe("US visa sponsor provider manifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aggregates approvals per employer across NAICS rows", () => {
    const sponsors = parseH1bExport(exportCsv, 2023);
    const acme = sponsors.find(
      (s) => s.organisationName === "ACME ROBOTICS INC",
    );

    expect(acme).toEqual({
      organisationName: "ACME ROBOTICS INC",
      townCity: "SEATTLE",
      county: "WA",
      typeRating: "H-1B employer (FY2023: 6 approvals)",
      route: "H-1B",
    });
  });

  it("skips empty-employer rows and employers with zero approvals", () => {
    const sponsors = parseH1bExport(exportCsv, 2023);
    const names = sponsors.map((s) => s.organisationName);

    expect(names).toEqual(["ACME ROBOTICS INC", "1 800 CONTACTS INC"]);
  });

  it("tolerates rows with missing location fields", () => {
    const sponsors = parseH1bExport(exportCsv, 2023);
    const contacts = sponsors.find(
      (s) => s.organisationName === "1 800 CONTACTS INC",
    );

    expect(contacts?.townCity).toBe("");
    expect(contacts?.county).toBe("");
  });

  it("downloads the newest available fiscal year and falls back on 404", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("2023")) {
        return Promise.resolve(new Response(exportCsv));
      }
      return Promise.resolve(new Response("not found", { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const sponsors = await manifest.fetchSponsors();

    expect(sponsors.length).toBeGreaterThan(0);
    expect(sponsors[0].typeRating).toContain("FY2023");
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls[urls.length - 1]).toContain("h1b_datahubexport-2023.csv");
  });

  it("throws an actionable error when no year is available", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("nope", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(manifest.fetchSponsors()).rejects.toThrow(
      "Failed to download US H-1B export",
    );
  });
});
