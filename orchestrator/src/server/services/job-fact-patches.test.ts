import { createJob } from "@shared/testing/factories";
import { describe, expect, it } from "vitest";
import { validateAndApplyJobPatches } from "./job-fact-patches";

describe("validateAndApplyJobPatches", () => {
  it("applies supported corrections and is idempotent", () => {
    const job = createJob({
      jobDescription:
        "<p>Pay\u00a0rate: £35 per hour. The role is based in Manchester.</p>",
      salaryInterval: "yearly",
      location: "London",
      locationEvidence: { location: "London", source: "extractor" },
    });
    const patches = [
      {
        field: "salaryInterval",
        value: "hourly",
        confidence: "high",
        evidence: "Pay rate: £35 per hour",
      },
      {
        field: "location",
        value: "Manchester",
        confidence: "high",
        evidence: "based in Manchester",
      },
    ];

    const first = validateAndApplyJobPatches(job, patches);
    const second = validateAndApplyJobPatches(first.patchedJob, patches);

    expect(first.updates).toEqual({
      salaryInterval: "hourly",
      location: "Manchester",
      salarySource: "ai_job_fact_review",
      locationEvidence: null,
    });
    expect(second.updates).toEqual({});
  });

  it("rejects unsafe patches", () => {
    const listing =
      "Pay rate: £35 per hour. We offer a competitive salary. This is a hybrid role.";
    const cases = [
      [
        {
          field: "salaryMinAmount",
          value: 45_000,
          confidence: "high",
          evidence: "competitive salary",
        },
        "evidence_does_not_support_value",
      ],
      [
        {
          field: "salaryInterval",
          value: "hourly",
          confidence: "high",
          evidence: "£40 per hour",
        },
        "evidence_not_in_job_description",
      ],
      [
        {
          field: "salaryInterval",
          value: "hourly",
          confidence: "low",
          evidence: "Pay rate: £35 per hour",
        },
        "low_confidence",
      ],
      [
        {
          field: "sourceJobId",
          value: "replacement",
          confidence: "high",
          evidence: "Pay rate: £35 per hour",
        },
        "unsupported_or_protected_field",
      ],
      [
        {
          field: "salaryInterval",
          value: "hour",
          confidence: "high",
          evidence: "Pay rate: £35 per hour",
        },
        "invalid_value",
      ],
      [
        {
          field: "workFromHomeType",
          value: "hybrid",
          confidence: "medium",
          evidence: "This is a hybrid role",
        },
        "medium_confidence_cannot_overwrite",
      ],
    ] as const;

    for (const [patch, reason] of cases) {
      const result = validateAndApplyJobPatches(
        createJob({
          jobDescription: listing,
          workFromHomeType: "remote",
        }),
        [patch],
      );
      expect(result.updates).toEqual({});
      expect(result.rejected[0]?.reason).toBe(reason);
    }
  });

  it("requires explicit wording before correcting remote status", () => {
    const patch = (evidence: string) => ({
      field: "isRemote",
      value: false,
      confidence: "high",
      evidence,
    });
    const explicit = validateAndApplyJobPatches(
      createJob({
        jobDescription: "You will work five days a week in our London office.",
        isRemote: true,
      }),
      [patch("five days a week in our London office")],
    );
    const ambiguous = validateAndApplyJobPatches(
      createJob({
        jobDescription: "Our London office has a gym.",
        isRemote: true,
      }),
      [patch("Our London office has a gym")],
    );

    expect(explicit.updates.isRemote).toBe(false);
    expect(ambiguous.updates).toEqual({});
  });

  it("rejects duplicate fields and invalid salary ranges", () => {
    const evidence = "Salary: £55,000 to £45,000 per year";
    const salaryPatch = (field: string, value: number) => ({
      field,
      value,
      confidence: "high",
      evidence,
    });
    const job = createJob({ jobDescription: evidence });
    const duplicate = validateAndApplyJobPatches(job, [
      salaryPatch("salaryMinAmount", 55_000),
      salaryPatch("salaryMinAmount", 45_000),
    ]);
    const range = validateAndApplyJobPatches(job, [
      salaryPatch("salaryMinAmount", 55_000),
      salaryPatch("salaryMaxAmount", 45_000),
    ]);

    expect(duplicate.rejected).toHaveLength(2);
    expect(range.updates).toEqual({});
  });
});
