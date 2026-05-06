import { createJob } from "@shared/testing/factories";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
  reserveNext: vi.fn(),
  acknowledge: vi.fn(),
  reject: vi.fn(),
  getReadyJobsWithGeneratedPdfs: vi.fn(),
}));

vi.mock("@server/infra/job-queue-registry", () => ({
  getJobQueue: vi.fn(() => ({
    enqueue: mocks.enqueue,
    reserveNext: mocks.reserveNext,
    acknowledge: mocks.acknowledge,
    reject: mocks.reject,
  })),
}));

vi.mock("@server/repositories/jobs", () => ({
  getReadyJobsWithGeneratedPdfs: mocks.getReadyJobsWithGeneratedPdfs,
  getJobById: vi.fn(),
}));

vi.mock("@server/tenancy/context", () => ({
  getActiveTenantId: vi.fn(() => "tenant-test"),
}));

vi.mock("./pdf-fingerprint", () => ({
  resolvePdfFingerprintContext: vi.fn().mockResolvedValue({}),
  getJobPdfFreshness: vi.fn((job: { pdfFingerprint?: string | null }) =>
    job.pdfFingerprint === "fresh" ? "current" : "stale",
  ),
}));

import {
  enqueueAutoPdfRegenerationForSettingsChanges,
  shouldEnqueueTailoringAutoPdfRegeneration,
} from "./auto-pdf-regeneration";

describe("auto PDF regeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueue.mockResolvedValue({
      id: "queue-job-1",
      queue: "auto_pdf_regeneration",
      acceptedAt: "2026-05-04T10:00:00.000Z",
      deduplicated: false,
    });
    mocks.reserveNext.mockResolvedValue(null);
    mocks.acknowledge.mockResolvedValue(undefined);
    mocks.reject.mockResolvedValue(undefined);
    mocks.getReadyJobsWithGeneratedPdfs.mockResolvedValue([]);
  });

  it("skips enqueue for non-PDF-impacting setting changes", async () => {
    const enqueued = await enqueueAutoPdfRegenerationForSettingsChanges({
      updatedSettingKeys: ["model", "searchTerms"],
      requestedBy: "user",
    });

    expect(enqueued).toBe(0);
    expect(mocks.getReadyJobsWithGeneratedPdfs).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("enqueues ready generated PDFs with settings_changed reason", async () => {
    mocks.getReadyJobsWithGeneratedPdfs.mockResolvedValue([
      createJob({
        id: "job-1",
        status: "ready",
        pdfPath: "data/pdfs/job-1.pdf",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
      createJob({
        id: "job-2",
        status: "ready",
        pdfPath: "data/pdfs/job-2.pdf",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    ]);

    const enqueued = await enqueueAutoPdfRegenerationForSettingsChanges({
      updatedSettingKeys: ["pdfRenderer"],
      requestedBy: "user",
    });

    expect(enqueued).toBe(2);
    expect(mocks.getReadyJobsWithGeneratedPdfs).toHaveBeenCalledWith(25, 0);
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
    expect(mocks.enqueue).toHaveBeenNthCalledWith(
      1,
      "auto_pdf_regeneration",
      expect.objectContaining({
        tenantId: "tenant-test",
        jobId: "job-1",
        reason: "settings_changed",
        requestedBy: "user",
      }),
      { dedupeKey: "tenant-test:job-1" },
    );
    expect(mocks.enqueue).toHaveBeenNthCalledWith(
      2,
      "auto_pdf_regeneration",
      expect.objectContaining({
        tenantId: "tenant-test",
        jobId: "job-2",
        reason: "settings_changed",
        requestedBy: "user",
      }),
      { dedupeKey: "tenant-test:job-2" },
    );
  });

  it("skips current generated PDFs when enqueueing settings refreshes", async () => {
    mocks.getReadyJobsWithGeneratedPdfs.mockResolvedValue([
      createJob({
        id: "job-current",
        status: "ready",
        pdfPath: "data/pdfs/job-current.pdf",
        pdfSource: "generated",
        pdfFingerprint: "fresh",
      }),
      createJob({
        id: "job-stale",
        status: "ready",
        pdfPath: "data/pdfs/job-stale.pdf",
        pdfSource: "generated",
        pdfFingerprint: "stale",
      }),
    ]);

    const enqueued = await enqueueAutoPdfRegenerationForSettingsChanges({
      updatedSettingKeys: ["pdfRenderer"],
      requestedBy: "user",
    });

    expect(enqueued).toBe(1);
    expect(mocks.enqueue).toHaveBeenCalledTimes(1);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "auto_pdf_regeneration",
      expect.objectContaining({ jobId: "job-stale" }),
      { dedupeKey: "tenant-test:job-stale" },
    );
  });

  it("marks ready generated jobs stale when tailoring fields change", () => {
    const previous = createJob({
      status: "ready",
      pdfSource: "generated",
      tailoredSummary: "before",
    });
    const next = createJob({
      status: "ready",
      pdfSource: "generated",
      tailoredSummary: "after",
    });

    expect(shouldEnqueueTailoringAutoPdfRegeneration(previous, next)).toBe(
      true,
    );
  });

  it("ignores jobs that are not backed by generated PDFs", () => {
    const previous = createJob({
      status: "ready",
      pdfSource: "uploaded",
      tailoredSummary: "before",
    });
    const next = createJob({
      status: "ready",
      pdfSource: "uploaded",
      tailoredSummary: "after",
    });

    expect(shouldEnqueueTailoringAutoPdfRegeneration(previous, next)).toBe(
      false,
    );
  });
});
