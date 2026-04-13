import { describe, expect, it } from "vitest";
import { queryKeys } from "./queryKeys";

describe("queryKeys", () => {
  it("builds the job notes key from the job id", () => {
    expect(queryKeys.jobs.notes("job-1")).toEqual(["jobs", "notes", "job-1"]);
  });
});
