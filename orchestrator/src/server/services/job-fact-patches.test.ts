import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { validateAndApplyJobPatches } from "./job-fact-patches";

describe("validateAndApplyJobPatches", () => {
  it("corrects an explicitly stated hourly salary and records its source", () => {
    const result = validateAndApplyJobPatches(
      createJob({
        jobDescription: "Pay rate: £35 per hour",
        salaryMinAmount: 35,
        salaryMaxAmount: 35,
        salaryCurrency: "GBP",
        salaryInterval: "yearly",
      }),
      [
        {
          field: "salaryInterval",
          value: "hourly",
          confidence: "high",
          evidence: "Pay rate: £35 per hour",
        },
      ],
    );

    expect(result.updates).toEqual({
      salaryInterval: "hourly",
      salarySource: "ai_job_fact_review",
    });
    expect(result.patchedJob.salaryInterval).toBe("hourly");
  });

  it("fills an explicitly stated annual salary range", () => {
    const evidence = "Salary: £45,000 to £55,000 per year";
    const result = validateAndApplyJobPatches(
      createJob({ jobDescription: evidence }),
      [
        {
          field: "salaryMinAmount",
          value: 45_000,
          confidence: "high",
          evidence,
        },
        {
          field: "salaryMaxAmount",
          value: 55_000,
          confidence: "high",
          evidence,
        },
        {
          field: "salaryCurrency",
          value: "GBP",
          confidence: "high",
          evidence,
        },
        {
          field: "salaryInterval",
          value: "yearly",
          confidence: "high",
          evidence,
        },
      ],
    );

    expect(result.updates).toMatchObject({
      salaryMinAmount: 45_000,
      salaryMaxAmount: 55_000,
      salaryCurrency: "GBP",
      salaryInterval: "yearly",
      salarySource: "ai_job_fact_review",
    });
  });

  it("rejects a salary number not supported by competitive-salary wording", () => {
    const result = validateAndApplyJobPatches(
      createJob({ jobDescription: "We offer a competitive salary." }),
      [
        {
          field: "salaryMinAmount",
          value: 45_000,
          confidence: "high",
          evidence: "competitive salary",
        },
      ],
    );

    expect(result.updates).toEqual({});
    expect(result.rejected).toEqual([
      {
        field: "salaryMinAmount",
        reason: "evidence_does_not_support_value",
      },
    ]);
  });

  it("corrects remote status only when the onsite wording is explicit", () => {
    const explicit = validateAndApplyJobPatches(
      createJob({
        jobDescription: "You will work five days a week in our London office.",
        isRemote: true,
      }),
      [
        {
          field: "isRemote",
          value: false,
          confidence: "high",
          evidence: "five days a week in our London office",
        },
      ],
    );
    const ambiguous = validateAndApplyJobPatches(
      createJob({
        jobDescription: "Our London office has a gym.",
        isRemote: true,
      }),
      [
        {
          field: "isRemote",
          value: false,
          confidence: "high",
          evidence: "Our London office has a gym",
        },
      ],
    );

    expect(explicit.updates.isRemote).toBe(false);
    expect(ambiguous.updates).toEqual({});
  });

  it("allows medium confidence only when filling a missing value", () => {
    const evidence = "This is a hybrid role.";
    const missing = validateAndApplyJobPatches(
      createJob({ jobDescription: evidence, workFromHomeType: null }),
      [
        {
          field: "workFromHomeType",
          value: "hybrid",
          confidence: "medium",
          evidence,
        },
      ],
    );
    const existing = validateAndApplyJobPatches(
      createJob({ jobDescription: evidence, workFromHomeType: "remote" }),
      [
        {
          field: "workFromHomeType",
          value: "hybrid",
          confidence: "medium",
          evidence,
        },
      ],
    );

    expect(missing.updates.workFromHomeType).toBe("hybrid");
    expect(existing.updates).toEqual({});
    expect(existing.rejected[0]?.reason).toBe(
      "medium_confidence_cannot_overwrite",
    );
  });

  it.each([
    {
      name: "missing evidence",
      patch: {
        field: "salaryInterval",
        value: "hourly",
        confidence: "high",
        evidence: "",
      },
      reason: "invalid_patch_shape",
    },
    {
      name: "evidence absent from the listing",
      patch: {
        field: "salaryInterval",
        value: "hourly",
        confidence: "high",
        evidence: "£40 per hour",
      },
      reason: "evidence_not_in_job_description",
    },
    {
      name: "low confidence",
      patch: {
        field: "salaryInterval",
        value: "hourly",
        confidence: "low",
        evidence: "Pay rate: £35 per hour",
      },
      reason: "low_confidence",
    },
    {
      name: "protected field",
      patch: {
        field: "sourceJobId",
        value: "replacement",
        confidence: "high",
        evidence: "Pay rate: £35 per hour",
      },
      reason: "unsupported_or_protected_field",
    },
    {
      name: "invalid enum value",
      patch: {
        field: "salaryInterval",
        value: "hour",
        confidence: "high",
        evidence: "Pay rate: £35 per hour",
      },
      reason: "invalid_value",
    },
  ])("rejects $name", ({ patch, reason }) => {
    const result = validateAndApplyJobPatches(
      createJob({ jobDescription: "Pay rate: £35 per hour" }),
      [patch],
    );

    expect(result.updates).toEqual({});
    expect(result.rejected[0]?.reason).toBe(reason);
  });

  it("rejects duplicate fields and invalid salary ranges", () => {
    const evidence = "Salary: £55,000 to £45,000 per year";
    const duplicate = validateAndApplyJobPatches(
      createJob({ jobDescription: evidence }),
      [
        {
          field: "salaryMinAmount",
          value: 55_000,
          confidence: "high",
          evidence,
        },
        {
          field: "salaryMinAmount",
          value: 45_000,
          confidence: "high",
          evidence,
        },
      ],
    );
    const range = validateAndApplyJobPatches(
      createJob({ jobDescription: evidence }),
      [
        {
          field: "salaryMinAmount",
          value: 55_000,
          confidence: "high",
          evidence,
        },
        {
          field: "salaryMaxAmount",
          value: 45_000,
          confidence: "high",
          evidence,
        },
      ],
    );

    expect(duplicate.rejected).toHaveLength(2);
    expect(duplicate.rejected[0]?.reason).toBe("duplicate_field");
    expect(range.updates).toEqual({});
    expect(range.rejected).toEqual(
      expect.arrayContaining([
        { field: "salaryMinAmount", reason: "invalid_salary_range" },
        { field: "salaryMaxAmount", reason: "invalid_salary_range" },
      ]),
    );
  });

  it("is idempotent and normalizes HTML, Unicode, and whitespace evidence", () => {
    const job = createJob({
      jobDescription: "<p>Pay\u00a0rate:  £35   per hour</p>",
      salaryInterval: "yearly",
    });
    const patches = [
      {
        field: "salaryInterval",
        value: "hourly",
        confidence: "high",
        evidence: "Pay rate: £35 per hour",
      },
    ];
    const first = validateAndApplyJobPatches(job, patches);
    const second = validateAndApplyJobPatches(first.patchedJob, patches);

    expect(first.updates.salaryInterval).toBe("hourly");
    expect(second.updates).toEqual({});
    expect(second.accepted).toEqual([]);
  });

  it("clears stale location evidence when correcting location", () => {
    const result = validateAndApplyJobPatches(
      createJob({
        jobDescription: "The role is based in Manchester.",
        location: "London",
        locationEvidence: {
          source: "explicit_location_field",
          evidenceQuality: "exact",
          rawLocation: "London",
        },
      }),
      [
        {
          field: "location",
          value: "Manchester",
          confidence: "high",
          evidence: "based in Manchester",
        },
      ],
    );

    expect(result.updates).toMatchObject({
      location: "Manchester",
      locationEvidence: null,
    });
  });
});
