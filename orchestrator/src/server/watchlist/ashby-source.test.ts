import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPublicAshbyUrl } from "./ashby-http";
import { getCursorJobLinks, resolveAshbySource } from "./ashby-source";

vi.mock("./ashby-http", async (original) => ({
  ...(await original<typeof import("./ashby-http")>()),
  readPublicAshbyUrl: vi.fn(),
}));
const read = vi.mocked(readPublicAshbyUrl);
const id = "d3bc1ced-3ce4-4086-a050-555055dbb1ff";
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
        text: `<a href="https://jobs.ashbyhq.com/linear/${id}/application">Apply</a>`,
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
      id,
      jobUrl: `https://jobs.ashbyhq.com/cursor/${id}`,
      urlSlug: "platform-engineer",
    };
    const chunk = `a:${JSON.stringify(["$", "Component", null, { jobs: [record] }])}\n`;
    read.mockResolvedValue({
      text: `<a href="/careers/platform-engineer">Engineer</a><script>self.__next_f.push(${JSON.stringify([1, chunk])})</script><script>throw new Error("must not execute")</script>`,
      url: "https://cursor.com/careers",
    });
    const links = await getCursorJobLinks();
    expect(links.get(id)).toBe("https://cursor.com/careers/platform-engineer");
  });
  it("does not trust Cursor slugs without a matching linked page and board", async () => {
    const record = { id, urlSlug: "platform-engineer" };
    read.mockResolvedValue({
      text: `<script>self.__next_f.push(${JSON.stringify([1, `a:${JSON.stringify(record)}\n`])})</script>`,
      url: "https://cursor.com/careers",
    });
    expect((await getCursorJobLinks()).size).toBe(0);
  });
});
