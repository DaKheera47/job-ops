import { createJob } from "@shared/testing/factories.js";
import type { JobActionResponse } from "@shared/types.js";
import { describe, expect, it } from "vitest";
import {
  canBulkMoveToReady,
  canBulkRescore,
  canBulkSkip,
  getFailedJobIds,
} from "./bulkActions";

describe("bulkActions", () => {
  it("computes eligibility for skip, move-to-ready, and rescore", () => {
    expect(
      canBulkSkip([
        createJob({ id: "1", status: "discovered" }),
        createJob({ id: "2", status: "ready" }),
      ]),
    ).toBe(true);
    expect(canBulkSkip([createJob({ id: "1", status: "applied" })])).toBe(
      false,
    );

    expect(
      canBulkMoveToReady([
        createJob({ id: "1", status: "discovered" }),
        createJob({ id: "2", status: "discovered" }),
      ]),
    ).toBe(true);
    expect(canBulkMoveToReady([createJob({ id: "1", status: "ready" })])).toBe(
      false,
    );

    expect(
      canBulkRescore([
        createJob({ id: "1", status: "discovered" }),
        createJob({ id: "2", status: "ready" }),
        createJob({ id: "3", status: "applied" }),
        createJob({ id: "4", status: "skipped" }),
        createJob({ id: "5", status: "expired" }),
      ]),
    ).toBe(true);
    expect(
      canBulkRescore([
        createJob({ id: "1", status: "ready" }),
        createJob({ id: "2", status: "processing" }),
      ]),
    ).toBe(false);
  });

  it("extracts failed job ids from a bulk response", () => {
    const response: JobActionResponse = {
      action: "skip",
      requested: 3,
      succeeded: 1,
      failed: 2,
      results: [
        {
          jobId: "job-1",
          ok: true,
          job: createJob({ id: "job-1", status: "skipped" }),
        },
        {
          jobId: "job-2",
          ok: false,
          error: { code: "INVALID_REQUEST", message: "bad status" },
        },
        {
          jobId: "job-3",
          ok: false,
          error: { code: "NOT_FOUND", message: "missing" },
        },
      ],
    };

    expect(Array.from(getFailedJobIds(response))).toEqual(["job-2", "job-3"]);
  });
});
