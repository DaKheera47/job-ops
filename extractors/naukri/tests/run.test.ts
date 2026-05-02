import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  dedupeNaukriJobs,
  makeSearchPageUrl,
  mapNaukriJob,
  resolveNaukriMaxJobsPerTerm,
  slugifyKeyword,
} from "../src/run";

const testDir = dirname(fileURLToPath(import.meta.url));

describe("naukri extractor mapping", () => {
  it("builds a default 7-day search URL with optional location", () => {
    expect(slugifyKeyword("Senior C++ Engineer")).toBe("senior-c-engineer");

    const url = new URL(
      makeSearchPageUrl({
        keyword: "software developer",
        location: "Bengaluru",
      }),
    );

    expect(url.pathname).toBe("/software-developer-jobs-in-bengaluru");
    expect(url.searchParams.get("k")).toBe("software developer");
    expect(url.searchParams.get("l")).toBe("Bengaluru");
    expect(url.searchParams.get("jobAge")).toBe("7");
  });

  it("maps raw Naukri jobs into CreateJobInput", () => {
    const mapped = mapNaukriJob({
      title: "Software engineer",
      jobId: "270426502000",
      companyName: "Barclays",
      jdURL:
        "/job-listings-software-engineer-barclays-pune-0-to-7-years-270426502000",
      companyApplyUrl:
        "https://www.naukri.com/cloudgateway-apply/apply-services/v0/apply/saveCompanyApply?id=&file=270426502000&logstr=srprestapi",
      createdDate: 1777288114000,
      tagsAndSkills: "Core Java,Unit testing",
      logoPathV3: "https://img.naukimg.com/logo.gif",
      currency: "INR",
      experienceText: "0-7 Yrs",
      placeholders: [
        { type: "salary", label: "Not disclosed" },
        { type: "location", label: "Pune" },
      ],
      salaryDetail: {
        minimumSalary: 0,
        maximumSalary: 0,
        currency: "INR",
        hideSalary: true,
      },
      ambitionBoxData: {
        AggregateRating: "3.8",
        ReviewsCount: 1156,
      },
      jobDescription: "Production systems",
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        source: "naukri",
        sourceJobId: "270426502000",
        title: "Software engineer",
        employer: "Barclays",
        jobUrl:
          "https://www.naukri.com/job-listings-software-engineer-barclays-pune-0-to-7-years-270426502000",
        applicationLink:
          "https://www.naukri.com/cloudgateway-apply/apply-services/v0/apply/saveCompanyApply?id=&file=270426502000&logstr=srprestapi",
        location: "Pune",
        locationEvidence: {
          rawLocation: "Pune",
          location: "Pune, India",
          countryKey: "india",
          country: "india",
          evidenceQuality: "approximate",
          source: "naukri",
          sourceNotes: ["Naukri is scoped to India in this extractor."],
        },
        datePosted: "2026-04-27T11:08:34.000Z",
        jobDescription: "Production systems",
        skills: "Core Java,Unit testing",
        experienceRange: "0-7 Yrs",
        companyLogo: "https://img.naukimg.com/logo.gif",
        companyRating: 3.8,
        companyReviewsCount: 1156,
        salaryCurrency: "INR",
      }),
    );
  });

  it("dedupes by source job id or URL and filters existing URLs", () => {
    const jobs = [
      {
        source: "naukri",
        sourceJobId: "one",
        jobUrl: "https://www.naukri.com/job-one",
      },
      {
        source: "naukri",
        sourceJobId: "one",
        jobUrl: "https://www.naukri.com/job-one-copy",
      },
      {
        source: "naukri",
        jobUrl: "https://www.naukri.com/existing",
      },
      {
        source: "naukri",
        jobUrl: "https://www.naukri.com/fresh",
      },
    ];

    expect(
      dedupeNaukriJobs(jobs, ["https://www.naukri.com/existing"]).map(
        (job) => job.jobUrl,
      ),
    ).toEqual([
      "https://www.naukri.com/job-one",
      "https://www.naukri.com/fresh",
    ]);
  });

  it("normalizes the internal max jobs per term setting", () => {
    expect(resolveNaukriMaxJobsPerTerm(undefined)).toBe(50);
    expect(resolveNaukriMaxJobsPerTerm("12")).toBe(12);
    expect(resolveNaukriMaxJobsPerTerm(12.9)).toBe(12);
    expect(resolveNaukriMaxJobsPerTerm(0)).toBe(1);
    expect(resolveNaukriMaxJobsPerTerm("not-a-number")).toBe(50);
  });

  it("does not contain normal-run debug file writes", async () => {
    const source = await readFile(join(testDir, "../src/run.ts"), "utf8");

    expect(source).not.toContain("writeFile");
    expect(source).not.toContain("naukri_captured_requests_debug");
    expect(source).not.toContain("naukri_api_page");
    expect(source).not.toContain("naukri_jobs.json");
  });
});
