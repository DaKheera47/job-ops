import type { Page } from "playwright";
import { describe, expect, it, vi } from "vitest";
import {
  readPageContentIfReady,
  waitForChallengeResolution,
} from "../src/challenge.js";

describe("challenge page navigation", () => {
  it("waits through a navigation before reporting a solved challenge", async () => {
    const page = {
      content: vi
        .fn()
        .mockRejectedValueOnce(
          new Error(
            "page.content: Unable to retrieve content because the page is navigating and changing the content.",
          ),
        )
        .mockResolvedValueOnce("<html>Just a moment...</html>")
        .mockResolvedValueOnce("<html>Job results</html>"),
      waitForTimeout: vi.fn(async () => undefined),
    } as unknown as Page;

    expect(await waitForChallengeResolution(page, 5_000)).toEqual({
      status: "passed",
    });
    expect(page.content).toHaveBeenCalledTimes(3);
    expect(page.waitForTimeout).toHaveBeenCalledTimes(2);
  });

  it("does not hide unexpected browser failures", async () => {
    const page = {
      content: vi.fn().mockRejectedValue(new Error("Page closed")),
    } as unknown as Page;

    await expect(readPageContentIfReady(page)).rejects.toThrow("Page closed");
  });
});
