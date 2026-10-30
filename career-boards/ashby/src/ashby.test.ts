import { beforeEach, describe, expect, it, vi } from "vitest";
import { ASHBY_JOBS_ORIGIN, parseAshbyUrl } from "./ashby-url";
import {
  ashbyLocation,
  getAshbyBoard,
  getCursorJobLinks,
  resolveAshbySource,
} from "./index";
import { readPublicAshbyUrl } from "./public-http";

vi.mock("./public-http", async (original) => ({
  ...(await original<typeof import("./public-http")>()),
  readPublicAshbyUrl: vi.fn(),
}));

export const posting = {
  id: "d3bc1ced-3ce4-4086-a050-555055dbb1ff",
  title: "Platform Engineer",
  jobUrl:
    "https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff",
  applyUrl:
    "https://jobs.ashbyhq.com/linear/d3bc1ced-3ce4-4086-a050-555055dbb1ff/application",
  isListed: true,
  descriptionHtml: "<p>Build reliable systems.</p>",
  descriptionPlain: "Build reliable systems.",
  location: "London, United Kingdom",
  workplaceType: "Hybrid",
  secondaryLocations: [{ location: "Dublin, Ireland" }],
};
const read = vi.mocked(readPublicAshbyUrl);
function feed(jobs: unknown[] = [posting]) {
  return {
    text: JSON.stringify({ apiVersion: "1", jobs }),
    url: "https://api.ashbyhq.com/posting-api/job-board/linear",
  };
}

describe("Ashby URLs and public feeds", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    "https://jobs.ashbyhq.com/Linear/?utm_source=test",
    posting.jobUrl,
    posting.applyUrl,
    "https://linear.app/careers",
    "https://api.ashbyhq.com/posting-api/job-board/linear?includeCompensation=true",
  ])("normalizes board identity: %s", (url) => {
    expect(parseAshbyUrl(url)).toEqual({
      board: "linear",
      careersUrl: "https://jobs.ashbyhq.com/linear",
    });
  });
  it.each([
    "http://jobs.ashbyhq.com/linear",
    "https://jobs.ashbyhq.com.evil.test/linear",
    "https://user:secret@jobs.ashbyhq.com/linear",
    "https://jobs.ashbyhq.com:8443/linear",
    "https://jobs.ashbyhq.com/linear/form/community",
    "https://jobs.ashbyhq.com/api/non-user-graphql",
    "https://api.ashbyhq.com/posting-api/job-board/linear/extra",
    "https://jobs.ashbyhq.com/%2e%2e",
    "https://jobs.ashbyhq.com/linear/not-a-job",
    "https://not-linear.app/careers",
  ])("rejects unsupported identities: %s", (url) =>
    expect(() => parseAshbyUrl(url)).toThrow());
  it("keeps Cursor's verified company destination", () => {
    expect(parseAshbyUrl("https://jobs.ashbyhq.com/Cursor")).toEqual({
      board: "cursor",
      careersUrl: "https://cursor.com/careers",
    });
  });
  it("fetches the whole board without a job count cap and excludes unlisted postings", async () => {
    const jobs = Array.from({ length: 814 }, (_, index) => {
      const id = `d3bc1ced-3ce4-4086-a050-${String(index).padStart(12, "0")}`;
      return {
        ...posting,
        id,
        jobUrl: `${ASHBY_JOBS_ORIGIN}/linear/${id}`,
        applyUrl: `${ASHBY_JOBS_ORIGIN}/linear/${id}/application`,
      };
    });
    read.mockResolvedValue(feed([...jobs, { ...posting, isListed: false }]));
    expect(
      (await getAshbyBoard("https://jobs.ashbyhq.com/linear")).jobs,
    ).toHaveLength(814);
    expect(read).toHaveBeenCalledWith(
      expect.stringContaining(
        "/posting-api/job-board/linear?includeCompensation=true",
      ),
      expect.objectContaining({ maxBytes: 25 * 1024 * 1024 }),
    );
  });
  it("accepts an explicitly empty board", async () => {
    read.mockResolvedValue(feed([]));
    expect(
      (await getAshbyBoard("https://jobs.ashbyhq.com/linear")).jobs,
    ).toEqual([]);
  });
  it.each([
    { ...posting, applyUrl: "javascript:alert(1)" },
    { ...posting, jobUrl: posting.jobUrl.replace("/linear/", "/other/") },
    { ...posting, id: "not-an-id" },
    { ...posting, descriptionHtml: 42 },
  ])("rejects invalid or foreign posting data", async (job) => {
    read.mockResolvedValue(feed([job]));
    await expect(
      getAshbyBoard("https://jobs.ashbyhq.com/linear"),
    ).rejects.toThrow(/invalid|inconsistent/);
  });
  it.each([
    "not json",
    '{"apiVersion":"2","jobs":[]}',
    "{}",
  ])("rejects invalid feed shapes", async (text) => {
    read.mockResolvedValue({ text, url: "https://api.ashbyhq.com" });
    await expect(
      getAshbyBoard("https://jobs.ashbyhq.com/linear"),
    ).rejects.toThrow("invalid or unsupported");
  });
  it("rejects duplicate posting identities", async () => {
    read.mockResolvedValue(feed([posting, posting]));
    await expect(
      getAshbyBoard("https://jobs.ashbyhq.com/linear"),
    ).rejects.toThrow("duplicate");
  });
  it("preserves hybrid and secondary locations, tolerating absent optional metadata", async () => {
    read.mockResolvedValue(
      feed([
        {
          ...posting,
          workplaceType: null,
          secondaryLocations: null,
          location: null,
        },
      ]),
    );
    const { jobs } = await getAshbyBoard("https://jobs.ashbyhq.com/linear");
    expect(ashbyLocation(jobs[0])).toBeNull();
    expect(ashbyLocation(posting)).toBe(
      "Hybrid; London, United Kingdom; Dublin, Ireland",
    );
    expect(
      ashbyLocation({
        ...posting,
        location: "London",
        address: { postalAddress: { addressCountry: "United Kingdom" } },
        secondaryLocations: [
          { location: "Dublin", address: { addressCountry: "Ireland" } },
        ],
      }),
    ).toBe("Hybrid; London, United Kingdom; Dublin, Ireland");
  });
});

describe("Ashby company page discovery", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([
    '<a href="https://jobs.ashbyhq.com/acme">Jobs</a>',
    '<iframe src="https://jobs.ashbyhq.com/acme"></iframe>',
    '<script>fetch("https://api.ashbyhq.com/posting-api/job-board/acme")</script>',
    '<script>{"jobUrl":"https:\\/\\/jobs.ashbyhq.com\\/acme"}</script>',
  ])("discovers references without executing scripts", async (html) => {
    read.mockResolvedValue({ text: html, url: "https://acme.example/careers" });
    await expect(
      resolveAshbySource("https://acme.example/careers"),
    ).resolves.toEqual({
      board: "acme",
      careersUrl: "https://jobs.ashbyhq.com/acme",
    });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("follows at most two same-site job pages, covering Lovable-style sites", async () => {
    read
      .mockResolvedValueOnce({
        text: '<a href="/careers/engineer">Engineer</a><a href="https://other.example/careers/job">External</a>',
        url: "https://acme.example/careers",
      })
      .mockResolvedValueOnce({
        text: `<a href="${posting.applyUrl}">Apply</a>`,
        url: "https://acme.example/careers/engineer",
      });
    expect(
      (await resolveAshbySource("https://acme.example/careers")).board,
    ).toBe("linear");
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("rejects ambiguous boards instead of guessing", async () => {
    read.mockResolvedValue({
      text: '<a href="https://jobs.ashbyhq.com/acme">A</a><a href="https://jobs.ashbyhq.com/other">B</a>',
      url: "https://acme.example/careers",
    });
    await expect(
      resolveAshbySource("https://acme.example/careers"),
    ).rejects.toThrow("multiple Ashby boards");
  });
  it("does not infer a board from a company name or an Ashby mention", async () => {
    read.mockResolvedValue({
      text: '<p>Powered by Ashby</p><a href="https://jobs.gem.com/retool/job">Jobs</a>',
      url: "https://acme.example/careers",
    });
    await expect(
      resolveAshbySource("https://acme.example/careers"),
    ).rejects.toThrow("No public Ashby board");
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("maps Cursor IDs to actual company links using inert page data", async () => {
    const record = {
      ...posting,
      jobUrl: posting.jobUrl.replace("linear", "cursor"),
      urlSlug: "platform-engineer",
    };
    const chunk = `a:${JSON.stringify(["$", "Component", null, { jobs: [record] }])}\n`;
    read.mockResolvedValue({
      text: `<a href="/careers/platform-engineer">Engineer</a><script>self.__next_f.push(${JSON.stringify([1, chunk])})</script><script>throw new Error("must not execute")</script>`,
      url: "https://cursor.com/careers",
    });
    const links = await getCursorJobLinks();
    expect(links.get(posting.id)).toBe(
      "https://cursor.com/careers/platform-engineer",
    );
  });
  it("does not trust Cursor slugs without a matching linked page and board", async () => {
    const record = { ...posting, urlSlug: "platform-engineer" };
    read.mockResolvedValue({
      text: `<script>self.__next_f.push(${JSON.stringify([1, `a:${JSON.stringify(record)}\n`])})</script>`,
      url: "https://cursor.com/careers",
    });
    expect((await getCursorJobLinks()).size).toBe(0);
  });
});
