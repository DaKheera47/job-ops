import * as api from "@client/api";
import type { DesignResumeDocument, DesignResumeJson } from "@shared/types";
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showErrorToast } from "@/client/lib/error-toast";
import { createTestQueryClient } from "../test/renderWithQueryClient";
import { useDesignResumeStudio } from "./useDesignResumeStudio";

const designResumeState = vi.hoisted(() => ({
  document: null as unknown,
}));

vi.mock("@client/api", () => ({
  updateDesignResume: vi.fn(),
  getDesignResume: vi.fn(),
  importDesignResumeFromRxResume: vi.fn(),
  importDesignResumeFromFile: vi.fn(),
  uploadDesignResumePictureFile: vi.fn(),
  deleteDesignResumePicture: vi.fn(),
  updateSetting: vi.fn(),
}));

vi.mock("@client/hooks/useDesignResume", () => ({
  useDesignResume: () => ({
    document: designResumeState.document,
    status: { exists: true, documentId: "primary", updatedAt: null },
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: () => ({ settings: null, isLoading: false }),
}));

vi.mock("@client/hooks/useTracerReadiness", () => ({
  useTracerReadiness: () => ({ readiness: null }),
}));

vi.mock("@/client/lib/error-toast", () => ({
  showErrorToast: vi.fn(),
}));

vi.mock("@/client/lib/private-pdf", () => ({
  downloadDesignResumePdf: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackProductEvent: vi.fn(),
  bucketCount: vi.fn(() => "1-5"),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

function makeResumeJson(marker: string): DesignResumeJson {
  return {
    basics: { name: marker },
    sections: { skills: { items: [] } },
  } as unknown as DesignResumeJson;
}

function makeDocument(
  revision: number,
  marker = `server-rev-${revision}`,
  updatedAt = "2026-08-01T00:00:00.000Z",
): DesignResumeDocument {
  return {
    id: "primary",
    title: "Resume Studio",
    resumeJson: makeResumeJson(marker),
    revision,
    sourceResumeId: null,
    sourceMode: null,
    importedAt: "2026-08-01T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt,
    assets: [],
  } as DesignResumeDocument;
}

function draftBasicsName(draft: DesignResumeDocument | null): string {
  const resumeJson = (draft?.resumeJson ?? {}) as {
    basics?: { name?: string };
  };
  return resumeJson.basics?.name ?? "";
}

function renderStudioHook() {
  const queryClient = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return renderHook(() => useDesignResumeStudio(), { wrapper });
}

async function flushAutosave() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(750);
  });
}

const conflictError = () =>
  Object.assign(
    new Error("Resume Studio has changed. Refresh and try again."),
    {
      status: 409,
      code: "CONFLICT",
    },
  );

describe("useDesignResumeStudio autosave conflict handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    designResumeState.document = makeDocument(9);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("recovers from a revision conflict by rebasing onto the server revision and retrying", async () => {
    vi.mocked(api.updateDesignResume)
      .mockRejectedValueOnce(conflictError())
      .mockResolvedValueOnce(makeDocument(11, "persisted"));
    vi.mocked(api.getDesignResume).mockResolvedValue(makeDocument(10));

    const { result } = renderStudioHook();
    expect(result.current.draft?.revision).toBe(9);

    act(() => {
      result.current.updateResumeJson(() => makeResumeJson("local-edit"));
    });

    // First autosave: sent with the stale revision, rejected with a conflict.
    await flushAutosave();
    expect(api.updateDesignResume).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.updateDesignResume).mock.calls[0][0]).toMatchObject({
      baseRevision: 9,
    });

    // Recovery: server document fetched, local edits kept, revision rebased.
    expect(api.getDesignResume).toHaveBeenCalledTimes(1);
    expect(result.current.draft?.revision).toBe(10);
    expect(draftBasicsName(result.current.draft)).toBe("local-edit");
    expect(result.current.dirty).toBe(true);

    // Retry: saved with the rebased revision and the local content.
    await flushAutosave();
    expect(api.updateDesignResume).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.updateDesignResume).mock.calls[1][0]).toMatchObject({
      baseRevision: 10,
      document: expect.objectContaining({
        basics: { name: "local-edit" },
      }),
    });
    expect(result.current.saveState).toBe("saved");
    expect(result.current.dirty).toBe(false);
    expect(showErrorToast).not.toHaveBeenCalled();
    // The overwrite of the concurrent writer is announced, not silent.
    expect(toast.info).toHaveBeenCalledWith(
      "Resume Studio was updated elsewhere. Your edits here were kept and re-saved.",
    );
  });

  it("surfaces the error after repeated conflicts instead of retrying forever", async () => {
    vi.mocked(api.updateDesignResume).mockRejectedValue(conflictError());
    let serverRevision = 9;
    vi.mocked(api.getDesignResume).mockImplementation(async () => {
      serverRevision += 1;
      return makeDocument(serverRevision);
    });

    const { result } = renderStudioHook();
    act(() => {
      result.current.updateResumeJson(() => makeResumeJson("local-edit"));
    });

    // 3 recovery attempts, then the 4th conflict surfaces as an error.
    for (let i = 0; i < 4; i += 1) {
      await flushAutosave();
    }

    expect(api.updateDesignResume).toHaveBeenCalledTimes(4);
    expect(result.current.saveState).toBe("error");
    expect(showErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({ status: 409 }),
      "Failed to save Resume Studio.",
    );
    // The local edits are still on screen, not silently discarded.
    expect(draftBasicsName(result.current.draft)).toBe("local-edit");
  });

  it("does not adopt a refetched document older than the local draft", async () => {
    const { result, rerender } = renderStudioHook();
    expect(result.current.draft?.revision).toBe(9);

    // A stale refetch (older revision, not newer by timestamp) must not
    // clobber the newer draft.
    designResumeState.document = makeDocument(8, "stale");
    rerender();
    expect(result.current.draft?.revision).toBe(9);

    // A genuinely newer document is still adopted.
    designResumeState.document = makeDocument(12, "newer");
    rerender();
    expect(result.current.draft?.revision).toBe(12);
  });

  it("adopts a re-imported document whose revision restarted but is newer by timestamp", async () => {
    const { result, rerender } = renderStudioHook();
    expect(result.current.draft?.revision).toBe(9);

    // A re-import replaces the document server-side with revision 1 and a
    // fresh updatedAt; a second mounted tab must adopt it on refetch.
    designResumeState.document = makeDocument(
      1,
      "imported",
      "2026-08-02T00:00:00.000Z",
    );
    rerender();
    expect(result.current.draft?.revision).toBe(1);
    expect(draftBasicsName(result.current.draft)).toBe("imported");
  });

  it("keeps a failed non-conflict save out of the recovery path", async () => {
    vi.mocked(api.updateDesignResume).mockRejectedValue(
      Object.assign(new Error("network down"), { status: 500 }),
    );

    const { result } = renderStudioHook();
    act(() => {
      result.current.updateResumeJson(() => makeResumeJson("local-edit"));
    });

    await flushAutosave();
    expect(api.getDesignResume).not.toHaveBeenCalled();
    expect(result.current.saveState).toBe("error");
    expect(showErrorToast).toHaveBeenCalled();
  });
});
