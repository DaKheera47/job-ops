import { parseVersion } from "./version";

describe("version", () => {
  it("normalizes bare semver into a release tag", () => {
    expect(parseVersion("0.1.30")).toBe("v0.1.30");
  });

  it("keeps prefixed release tags unchanged", () => {
    expect(parseVersion("v0.1.30")).toBe("v0.1.30");
  });

  it("falls back to unknown for empty values", () => {
    expect(parseVersion("")).toBe("unknown");
  });
});
