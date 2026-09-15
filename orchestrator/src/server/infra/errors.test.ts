import { describe, expect, it } from "vitest";
import { z } from "zod";
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

  it("preserves nested paths and constraints from real zod errors", () => {
    const result = z
      .object({
        job: z.object({
          disciplines: z.string().max(200),
        }),
      })
      .safeParse({ job: { disciplines: "x".repeat(201) } });

    expect(result.success).toBe(false);
    if (result.success) return;

    const appError = toAppError(result.error);

    expect(appError.status).toBe(400);
    expect(appError.details).toMatchObject({
      fieldErrors: {
        job: [expect.any(String)],
      },
      issues: [
        {
          code: "too_big",
          path: ["job", "disciplines"],
          maximum: 200,
        },
      ],
    });
  });
});
