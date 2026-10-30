import { runWithRequestContext } from "@infra/request-context";
import type { WatchlistSelectedSource } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readPublicAshbyUrl } from "../ashby-http";
import { ashbyWatchlistAdapter as adapter } from "./ashby";

vi.mock("../ashby-http", async (original) => ({
  ...(await original<typeof import("../ashby-http")>()),
  readPublicAshbyUrl: vi.fn(),
}));
const read = vi.mocked(readPublicAshbyUrl);
function response(jobs: unknown[] = [job]) {
  return {
    text: JSON.stringify({ apiVersion: "1", jobs }),
    url: "https://api.ashbyhq.com/posting-api/job-board/linear",
  };
}
const id = "d3bc1ced-3ce4-4086-a050-555055dbb1ff";
const job = {
  id,
  title: "Engineer",
  isListed: true,
  workplaceType: "Hybrid",
  location: "London, United Kingdom",
  secondaryLocations: [{ location: "Dublin, Ireland" }],
  jobUrl: `https://jobs.ashbyhq.com/linear/${id}`,
  applyUrl: `https://jobs.ashbyhq.com/linear/${id}/application`,
  descriptionHtml: "<p>Build systems</p>",
  descriptionPlain: "Build systems",
  employmentType: "FullTime",
  shouldDisplayCompensationOnJobPostings: true,
  compensation: { scrapeableCompensationSalarySummary: "£80K – £100K" },
};
const source: WatchlistSelectedSource = {
  id: "selected-source",
  catalogSourceId: null,
  sourceType: "ashby",
  label: "Linear",
  careersUrl: "https://jobs.ashbyhq.com/linear",
  cxsJobsUrl: null,
  isCustom: true,
  sortOrder: 0,
  createdAt: "2026-10-30",
  updatedAt: "2026-10-30",
};
let user = 0;
function scoped<T>(
  fn: () => T,
  tenantId = "tenant-a",
  userId = `user-${user}`,
) {
  return runWithRequestContext({ tenantId, userId }, fn);
}
describe("Ashby Watchlist adapter", () => {
  beforeEach(() => {
    user += 1;
    vi.clearAllMocks();
    read.mockResolvedValue(response());
  });
  it("normalizes catalog sources and custom selections", async () => {
    expect(
      adapter.parseCatalogSources([
        { label: "Linear", ashbyUrl: job.applyUrl },
      ]),
    ).toEqual([
      {
        id: "ashby:linear",
        sourceType: "ashby",
        label: "Linear",
        careersUrl: source.careersUrl,
        cxsJobsUrl: null,
      },
    ]);
    await expect(
      scoped(() =>
        adapter.normalizeCustomSelection({
          label: null,
          careersUrl: "https://linear.app/careers",
        }),
      ),
    ).resolves.toEqual({ label: "Linear", careersUrl: source.careersUrl });
  });
  it("reuses one feed for listings, details, and drafts, preserving hybrid and secondary locations", async () => {
    await scoped(async () => {
      const list = await adapter.fetchJobs({ source });
      expect(list.jobs[0]).toMatchObject({
        jobRef: id,
        source: "ashby:linear",
        isRemote: false,
        location: "Hybrid; London, United Kingdom; Dublin, Ireland",
        locationEvidence: { workplaceType: "hybrid" },
      });
      await expect(
        adapter.fetchJobDetails({ source, jobRef: id }),
      ).resolves.toMatchObject({ descriptionHtml: job.descriptionHtml });
      await expect(
        adapter.prepareImportDraft({ source, jobRef: id }),
      ).resolves.toMatchObject({
        draft: {
          sourceJobId: id,
          jobDescription: job.descriptionPlain,
          salary: "£80K – £100K",
          applicationLink: job.applyUrl,
        },
      });
    });
    expect(readPublicAshbyUrl).toHaveBeenCalledTimes(1);
  });
  it("never fetches a caller-supplied job URL or a posting outside the selected board", async () => {
    await expect(
      scoped(() =>
        adapter.fetchJobDetails({ source, jobRef: "https://127.0.0.1/secret" }),
      ),
    ).rejects.toThrow("selected source");
    expect(readPublicAshbyUrl).not.toHaveBeenCalled();
    await expect(
      scoped(() =>
        adapter.prepareImportDraft({
          source,
          jobRef: "00000000-0000-4000-8000-000000000000",
        }),
      ),
    ).rejects.toThrow("selected source");
  });
  it("isolates cached feeds across users and tenants", async () => {
    await scoped(() => adapter.fetchJobs({ source }), "tenant-a", "alice");
    await scoped(() => adapter.fetchJobs({ source }), "tenant-a", "alice");
    await scoped(() => adapter.fetchJobs({ source }), "tenant-a", "bob");
    await scoped(() => adapter.fetchJobs({ source }), "tenant-b", "alice");
    expect(readPublicAshbyUrl).toHaveBeenCalledTimes(3);
  });
  it("coalesces simultaneous requests only inside the same tenant/user", async () => {
    await scoped(() =>
      Promise.all([
        adapter.fetchJobs({ source }),
        adapter.fetchJobs({ source }),
      ]),
    );
    expect(readPublicAshbyUrl).toHaveBeenCalledTimes(1);
  });
  it("retains a complete large board, dedupes IDs, and excludes unlisted postings", async () => {
    const jobs = Array.from({ length: 814 }, (_, index) => ({
      ...job,
      id: `d3bc1ced-3ce4-4086-a050-${String(index).padStart(12, "0")}`,
    }));
    read.mockResolvedValue(
      response([...jobs, jobs[0], { ...job, isListed: false }]),
    );
    expect((await scoped(() => adapter.fetchJobs({ source }))).fetched).toBe(
      814,
    );
  });
  it.each([
    "invalid JSON",
    '{"apiVersion":"2","jobs":[]}',
    '{"apiVersion":"1","jobs":[{"id":"bad"}]}',
  ])("rejects malformed feeds", async (text) => {
    read.mockResolvedValue({ text, url: "https://api.ashbyhq.com" });
    await expect(
      scoped(() => adapter.fetchJobs({ source })),
    ).rejects.toMatchObject({ status: 502 });
  });
  it("ignores upstream URL fields and constructs safe destinations from the selected board", async () => {
    read.mockResolvedValue(
      response([
        {
          ...job,
          jobUrl: "javascript:alert(1)",
          applyUrl: "https://other.example/job",
        },
      ]),
    );
    expect(
      (await scoped(() => adapter.fetchJobs({ source }))).jobs[0],
    ).toMatchObject({ jobUrl: job.jobUrl, applicationLink: job.applyUrl });
  });
  it("does not cache a failed fetch", async () => {
    read.mockRejectedValueOnce(new Error("HTTP 503"));
    await expect(
      scoped(() => adapter.fetchJobs({ source })),
    ).rejects.toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
    await expect(
      scoped(() => adapter.fetchJobs({ source })),
    ).resolves.toMatchObject({ fetched: 1 });
    expect(readPublicAshbyUrl).toHaveBeenCalledTimes(2);
  });
  it("does not expose compensation when the posting disables it", async () => {
    read.mockResolvedValue(
      response([{ ...job, shouldDisplayCompensationOnJobPostings: false }]),
    );
    const draft = await scoped(() =>
      adapter.prepareImportDraft({ source, jobRef: id }),
    );
    expect(draft.draft.salary).toBeUndefined();
  });
  it.each([
    true,
    false,
  ])("requires verified Cursor links (available: %s)", async (available) => {
    const record = {
      id,
      jobUrl: `https://jobs.ashbyhq.com/cursor/${id}`,
      urlSlug: "engineer",
    };
    const script = `a:${JSON.stringify(record)}\n`;
    read.mockResolvedValueOnce(response()).mockResolvedValueOnce({
      url: "https://cursor.com/careers",
      text: available
        ? `<a href="/careers/engineer">Job</a><script>self.__next_f.push(${JSON.stringify([1, script])})</script>`
        : "No matching job links",
    });
    const result = scoped(() =>
      adapter.fetchJobs({
        source: { ...source, careersUrl: "https://cursor.com/careers" },
      }),
    );
    if (available)
      expect((await result).jobs[0].applicationLink).toBe(
        "https://cursor.com/careers/engineer#apply",
      );
    else await expect(result).rejects.toMatchObject({ status: 502 });
  });
  it("refreshes an expired snapshot and preserves unknown workplace types", async () => {
    read.mockResolvedValue(response([{ ...job, workplaceType: "FutureType" }]));
    await scoped(async () => {
      expect(
        (await adapter.fetchJobs({ source })).jobs[0].isRemote,
      ).toBeUndefined();
      const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 61_000);
      try {
        await adapter.fetchJobs({ source });
      } finally {
        clock.mockRestore();
      }
    });
    expect(readPublicAshbyUrl).toHaveBeenCalledTimes(2);
  });
});
