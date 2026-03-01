import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn(),
}));

import { getSetting } from "@server/repositories/settings";
import { getWritingStyle } from "./writing-style";

describe("getWritingStyle", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses defaults when no overrides are stored", async () => {
    vi.mocked(getSetting).mockResolvedValue(null);

    await expect(getWritingStyle()).resolves.toEqual({
      tone: "professional",
      formality: "medium",
      constraints: "",
      doNotUse: "",
    });
  });

  it("uses stored overrides when present", async () => {
    vi.mocked(getSetting).mockImplementation(async (key) => {
      switch (key) {
        case "chatStyleTone":
          return "friendly";
        case "chatStyleFormality":
          return "low";
        case "chatStyleConstraints":
          return "Keep it short";
        case "chatStyleDoNotUse":
          return "synergy";
        default:
          return null;
      }
    });

    await expect(getWritingStyle()).resolves.toEqual({
      tone: "friendly",
      formality: "low",
      constraints: "Keep it short",
      doNotUse: "synergy",
    });
  });
});
