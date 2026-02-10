import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./client";

const customToast = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    custom: (...args: unknown[]) => customToast(...args),
  },
}));

describe("API client demo toasts", () => {
  beforeEach(() => {
    customToast.mockClear();
    vi.restoreAllMocks();
    api.__resetApiClientAuthForTests();
  });

  it("shows simulated toast when response meta.simulated is true", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          data: { message: "ok" },
          meta: { requestId: "req-1", simulated: true },
        }),
    } as Response);

    await api.runPipeline();

    expect(customToast).toHaveBeenCalledTimes(1);
  });

  it("shows blocked toast when response meta.blockedReason is present", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      status: 403,
      text: async () =>
        JSON.stringify({
          ok: false,
          error: { code: "FORBIDDEN", message: "Blocked" },
          meta: { requestId: "req-2", blockedReason: "Disabled in demo" },
        }),
    } as Response);

    await expect(
      api.updateSettings({ llmProvider: "openrouter" }),
    ).rejects.toThrow("Blocked");
    expect(customToast).toHaveBeenCalledTimes(1);
  });
});
