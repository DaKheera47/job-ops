import {
  ashbyLocation,
  getAshbyBoard,
  getCursorJobLinks,
  resolveAshbySource,
} from "@career-boards/ashby";
import { runWithRequestContext } from "@infra/request-context";
import type { WatchlistSelectedSource } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ashbyWatchlistAdapter as adapter } from "./ashby";

vi.mock("@career-boards/ashby", async (original) => ({
  ...(await original<typeof import("@career-boards/ashby")>()),
  getAshbyBoard: vi.fn(),
  getCursorJobLinks: vi.fn(),
  resolveAshbySource: vi.fn(),
}));
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
    vi.mocked(getAshbyBoard).mockResolvedValue({
      board: "linear",
      jobs: [job],
    });
    vi.mocked(getCursorJobLinks).mockResolvedValue(new Map());
    vi.mocked(resolveAshbySource).mockResolvedValue({
      board: "linear",
      careersUrl: source.careersUrl,
    });
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
        location: ashbyLocation(job),
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
    expect(getAshbyBoard).toHaveBeenCalledTimes(1);
  });
  it("never fetches a caller-supplied job URL or a posting outside the selected board", async () => {
    await expect(
      scoped(() =>
        adapter.fetchJobDetails({ source, jobRef: "https://127.0.0.1/secret" }),
      ),
    ).rejects.toThrow("selected source");
    expect(getAshbyBoard).not.toHaveBeenCalled();
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
    expect(getAshbyBoard).toHaveBeenCalledTimes(3);
  });
  it("coalesces simultaneous requests only inside the same tenant/user", async () => {
    await scoped(() =>
      Promise.all([
        adapter.fetchJobs({ source }),
        adapter.fetchJobs({ source }),
      ]),
    );
    expect(getAshbyBoard).toHaveBeenCalledTimes(1);
  });
  it("does not cache a failed fetch", async () => {
    vi.mocked(getAshbyBoard).mockRejectedValueOnce(new Error("HTTP 503"));
    await expect(
      scoped(() => adapter.fetchJobs({ source })),
    ).rejects.toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
    await expect(
      scoped(() => adapter.fetchJobs({ source })),
    ).resolves.toMatchObject({ fetched: 1 });
    expect(getAshbyBoard).toHaveBeenCalledTimes(2);
  });
  it("does not expose compensation when the posting disables it", async () => {
    vi.mocked(getAshbyBoard).mockResolvedValue({
      board: "linear",
      jobs: [{ ...job, shouldDisplayCompensationOnJobPostings: false }],
    });
    const draft = await scoped(() =>
      adapter.prepareImportDraft({ source, jobRef: id }),
    );
    expect(draft.draft.salary).toBeUndefined();
  });
  it("refreshes an expired snapshot and preserves unknown workplace types", async () => {
    vi.mocked(getAshbyBoard).mockResolvedValue({
      board: "linear",
      jobs: [{ ...job, workplaceType: "FutureType" }],
    });
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
    expect(getAshbyBoard).toHaveBeenCalledTimes(2);
  });
  it("uses verified Cursor company URLs for both listing and import", async () => {
    vi.mocked(getAshbyBoard).mockResolvedValue({
      board: "cursor",
      jobs: [job],
    });
    vi.mocked(getCursorJobLinks).mockResolvedValue(
      new Map([[id, "https://cursor.com/careers/engineer"]]),
    );
    const cursor = { ...source, careersUrl: "https://cursor.com/careers" };
    await scoped(async () => {
      expect(
        (await adapter.fetchJobs({ source: cursor })).jobs[0],
      ).toMatchObject({
        source: "ashby:cursor",
        jobUrl: "https://cursor.com/careers/engineer",
        applicationLink: "https://cursor.com/careers/engineer#apply",
      });
      expect(
        (await adapter.prepareImportDraft({ source: cursor, jobRef: id })).draft
          .jobUrl,
      ).toBe("https://cursor.com/careers/engineer");
    });
  });
  it("fails visibly if Cursor's ID-to-company-link mapping is incomplete", async () => {
    vi.mocked(getAshbyBoard).mockResolvedValue({
      board: "cursor",
      jobs: [job],
    });
    await expect(
      scoped(() =>
        adapter.fetchJobs({
          source: { ...source, careersUrl: "https://cursor.com/careers" },
        }),
      ),
    ).rejects.toMatchObject({ status: 502, code: "UPSTREAM_ERROR" });
  });
});
