import { describe, expect, it, vi } from "vitest";
import { validateAndMaybePersistRxResumeMode } from "./rxresume-config";

describe("validateAndMaybePersistRxResumeMode", () => {
  it("omits blank baseUrl by default", async () => {
    const validate = vi.fn().mockResolvedValue({
      valid: true,
      message: null,
      status: null,
    });

    await validateAndMaybePersistRxResumeMode({
      stored: { apiKey: false },
      draft: {
        apiKey: "rx-key",
        baseUrl: "",
      },
      validate,
      skipPrecheck: true,
    });

    expect(validate).toHaveBeenCalledWith({
      apiKey: "rx-key",
      baseUrl: undefined,
    });
  });

  it("preserves blank baseUrl when requested", async () => {
    const validate = vi.fn().mockResolvedValue({
      valid: true,
      message: null,
      status: null,
    });

    await validateAndMaybePersistRxResumeMode({
      stored: { apiKey: false },
      draft: {
        apiKey: "rx-key",
        baseUrl: "",
      },
      validationPayloadOptions: {
        preserveBlankFields: ["baseUrl"],
      },
      validate,
      skipPrecheck: true,
    });

    expect(validate).toHaveBeenCalledWith({
      apiKey: "rx-key",
      baseUrl: "",
    });
  });
});
