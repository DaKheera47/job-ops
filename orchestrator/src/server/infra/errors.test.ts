import { describe, expect, it } from "vitest";
import { toAppError } from "./errors";

describe("toAppError", () => {
  it("preserves issues for zod-like errors without a local flatten method", () => {
    const error = Object.assign(new Error("Invalid payload"), {
      name: "ZodError",
      issues: [
        {
          code: "custom",
          path: ["field"],
          message: "Field is invalid",
        },
      ],
    });

    const appError = toAppError(error);

    expect(appError.status).toBe(400);
    expect(appError.code).toBe("INVALID_REQUEST");
    expect(appError.details).toEqual({
      formErrors: [],
      fieldErrors: {},
      issues: [
        {
          code: "custom",
          path: ["field"],
          message: "Field is invalid",
        },
      ],
    });
  });
});
