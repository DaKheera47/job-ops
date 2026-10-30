import { describe, expect, it } from "vitest";
import { parseAshbyUrl } from "./ashby";

describe("Ashby source identities", () => {
  it.each([
    "https://jobs.ashbyhq.com/Linear/?utm_source=test",
    "https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff/application",
    "https://api.ashbyhq.com/posting-api/job-board/linear",
    "https://linear.app/careers",
  ])("canonicalizes %s", (input) =>
    expect(parseAshbyUrl(input).careersUrl).toBe(
      "https://jobs.ashbyhq.com/linear",
    ));
  it.each([
    "http://jobs.ashbyhq.com/linear",
    "https://jobs.ashbyhq.com.evil.test/linear",
    "https://user:secret@jobs.ashbyhq.com/linear",
    "https://jobs.ashbyhq.com:8443/linear",
    "https://jobs.ashbyhq.com/linear/form/community",
    "https://jobs.ashbyhq.com/api/non-user-graphql",
    "https://jobs.ashbyhq.com/%2e%2e",
    "https://jobs.ashbyhq.com/linear/not-a-job",
    "https://not-linear.app/careers",
  ])("rejects %s", (input) => expect(() => parseAshbyUrl(input)).toThrow());
});
