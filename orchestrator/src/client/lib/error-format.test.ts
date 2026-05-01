import { describe, expect, it } from "vitest";
import {
  formatUserFacingError,
  stripRequestIdFromMessage,
} from "./error-format";

describe("error-format", () => {
  it("strips requestId suffix from error messages", () => {
    expect(
      stripRequestIdFromMessage(
        "Validation failed. (requestId: 123e4567-e89b-12d3-a456-426614174000)",
      ),
    ).toBe("Validation failed.");
  });

  it("maps jobDescription zod errors to a friendly message", () => {
    const raw = JSON.stringify([
      {
        code: "too_small",
        minimum: 1,
        type: "string",
        inclusive: true,
        exact: false,
        message: "String must contain at least 1 character(s)",
        path: ["jobDescription"],
      },
    ]);

    expect(formatUserFacingError(new Error(raw))).toBe(
      "Please enter a job description before continuing.",
    );
  });

  it("maps design-resume skill name validation paths to a friendly message", () => {
    const raw =
      'Design Resume must be a valid Reactive Resume v5 document. Resume schema validation failed at "sections.skills.items.7.name": String must contain at least 1 character(s)';

    expect(formatUserFacingError(new Error(raw))).toBe(
      "Please enter a skill (e.g., Python, SQL).",
    );
  });

  it("maps invalid url validation issues to a friendly field-specific message", () => {
    const raw = JSON.stringify([
      {
        validation: "url",
        code: "invalid_string",
        message: "Invalid url",
        path: ["job", "applicationLink"],
      },
    ]);

    expect(formatUserFacingError(new Error(raw))).toBe(
      "Please enter a valid application link URL.",
    );
  });

  it("maps zod issue JSON with a requestId suffix to a friendly message", () => {
    const raw = `${JSON.stringify([
      {
        validation: "url",
        code: "invalid_string",
        message: "Invalid url",
        path: ["job", "jobUrl"],
      },
    ])} (requestId: 541baba5-26cf-4e23-8e8b-5bd9f7a5f68e)`;

    expect(formatUserFacingError(new Error(raw))).toBe(
      "Please enter a valid job URL.",
    );
  });

  it("maps direct zod-like error objects to a friendly message", () => {
    const error = {
      name: "ZodError",
      message: "Validation failed",
      issues: [
        {
          format: "url",
          code: "invalid_format",
          message: "Invalid URL",
          path: ["jobUrl"],
        },
      ],
    };

    expect(formatUserFacingError(error)).toBe("Please enter a valid job URL.");
  });

  it("uses error details payload when message is generic", () => {
    const error = {
      message: "Validation failed",
      details: {
        issues: [
          {
            validation: "url",
            code: "invalid_string",
            message: "Invalid url",
            path: ["job", "applicationLink"],
          },
        ],
      },
    };

    expect(formatUserFacingError(error)).toBe(
      "Please enter a valid application link URL.",
    );
  });

  it("uses nested API error details payload when message is generic", () => {
    const error = {
      ok: false,
      error: {
        code: "INVALID_REQUEST",
        message: "Validation failed",
        details: {
          issues: [
            {
              validation: "url",
              code: "invalid_string",
              message: "Invalid url",
              path: ["job", "jobUrl"],
            },
          ],
        },
      },
      meta: { requestId: "541baba5-26cf-4e23-8e8b-5bd9f7a5f68e" },
    };

    expect(formatUserFacingError(error)).toBe("Please enter a valid job URL.");
  });

  it("uses flattened zod field errors when available", () => {
    const error = {
      message: "Validation failed",
      details: {
        formErrors: [],
        fieldErrors: {
          jobUrl: ["Invalid url"],
        },
      },
    };

    expect(formatUserFacingError(error)).toBe("Please enter a valid job URL.");
  });

  it("falls back to generic message for unparseable JSON errors", () => {
    expect(formatUserFacingError(new Error("[not-valid-json]"))).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
