import { describe, expect, it } from "vitest";
import { parseVisaSponsorsCsv } from "./csv";

describe("parseVisaSponsorsCsv", () => {
  it("parses CRLF files and strips a UTF-8 BOM", () => {
    const csv = [
      "\uFEFFOrganisation Name,Town/City,County,Type & Rating,Route",
      '"Acme Ltd","London","Greater London","Worker","Skilled Worker"',
      '"Beta Corp","Manchester","Greater Manchester","Temporary","Graduate"\r',
    ].join("\r\n");

    expect(parseVisaSponsorsCsv(csv)).toEqual([
      {
        organisationName: "Acme Ltd",
        townCity: "London",
        county: "Greater London",
        typeRating: "Worker",
        route: "Skilled Worker",
      },
      {
        organisationName: "Beta Corp",
        townCity: "Manchester",
        county: "Greater Manchester",
        typeRating: "Temporary",
        route: "Graduate",
      },
    ]);
  });
});
