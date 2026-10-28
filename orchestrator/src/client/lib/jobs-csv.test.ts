import { createJob } from "@shared/testing/factories.js";
import { describe, expect, it } from "vitest";
import { serializeJobsCsv } from "./jobs-csv";

describe("job CSV export", () => {
  it("exports an Excel-friendly snapshot with null values, zero scores and source timestamps", () => {
    const csv = serializeJobsCsv([
      createJob({
        id: "one",
        title: "Engineer",
        employer: "Acme",
        location: null,
        salary: null,
        suitabilityScore: 0,
        appliedAt: "2026-10-28T02:30:00Z",
      }),
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const [header, row] = csv.slice(1).split("\r\n");
    const cells = Object.fromEntries(
      header.split(",").map((key, i) => [key, row.split(",")[i]]),
    );
    expect(cells['"Job ID"']).toBe('"one"');
    expect(cells['"Title"']).toBe('"Engineer"');
    expect(cells['"Employer"']).toBe('"Acme"');
    expect(cells['"Location"']).toBe('""');
    expect(cells['"Salary"']).toBe('""');
    expect(cells['"Score"']).toBe('"0"');
    expect(cells['"Applied at"']).toBe('"2026-10-28T02:30:00Z"');
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("quotes commas, literal quotes, embedded newlines and Unicode without changing the data", () => {
    const csv = serializeJobsCsv([
      createJob({
        title: 'Developer, "Platform"\nEngineer',
        employer: "公司 📄",
        location: "Toronto\r\nCanada",
      }),
    ]);
    expect(csv).toContain('"Developer, ""Platform""\nEngineer"');
    expect(csv).toContain('"公司 📄"');
    expect(csv).toContain('"Toronto\r\nCanada"');
  });

  it.each([
    "=1+1",
    "+cmd",
    "-formula",
    "@SUM(A1)",
    " \t=1+1",
    "\r\n@SUM(A1)",
  ])("treats spreadsheet formula text as literal data: %j", (title) => {
    const csv = serializeJobsCsv([createJob({ title })]);
    expect(csv).toContain(`"'${title}"`);
  });

  it("keeps the supplied filtered ordering and excludes private/detail-only fields", () => {
    const csv = serializeJobsCsv([
      createJob({
        id: "second",
        title: "Second",
        jobDescription: "PRIVATE_DESCRIPTION",
        tailoredSummary: "PRIVATE_RESUME",
        emails: "PRIVATE_EMAIL",
      }),
      createJob({ id: "first", title: "First" }),
    ]);
    expect(csv.indexOf('"second"')).toBeLessThan(csv.indexOf('"first"'));
    expect(csv).not.toContain("PRIVATE_");
  });
});
