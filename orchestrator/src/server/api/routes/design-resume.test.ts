import { describe, expect, it } from "vitest";
import { designResumePatchSchema } from "./design-resume";

describe("designResumePatchSchema", () => {
  it("rejects patch paths that are not valid JSON pointers", () => {
    const result = designResumePatchSchema.safeParse({
      baseRevision: 1,
      operations: [
        {
          op: "replace",
          path: "basics/name",
          value: "Taylor",
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(
      "Patch paths must be valid JSON Pointers.",
    );
  });

  it("requires a value for test operations", () => {
    const result = designResumePatchSchema.safeParse({
      baseRevision: 1,
      operations: [
        {
          op: "test",
          path: "/basics/name",
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
