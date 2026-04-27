import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadRememberedAuthUsers,
  rememberAuthUser,
} from "./remembered-auth-users";

describe("remembered auth users", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it("stores usernames without passwords and keeps the latest first", () => {
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    rememberAuthUser({ username: "admin", displayName: "Admin" });

    vi.setSystemTime(new Date("2026-01-01T00:01:00.000Z"));
    rememberAuthUser({ username: "sam" });

    expect(loadRememberedAuthUsers()).toMatchObject([
      { username: "sam", displayName: null },
      { username: "admin", displayName: "Admin" },
    ]);
    expect(localStorage.getItem("jobops.rememberedAuthUsers")).not.toContain(
      "password",
    );
  });

  it("keeps an existing display name when the next sign-in only has a username", () => {
    rememberAuthUser({ username: "admin", displayName: "Admin" });
    rememberAuthUser({ username: "admin" });

    expect(loadRememberedAuthUsers()[0]).toMatchObject({
      username: "admin",
      displayName: "Admin",
    });
  });
});
