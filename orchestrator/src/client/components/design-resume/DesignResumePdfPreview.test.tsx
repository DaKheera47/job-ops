import * as api from "@client/api";
import type { DesignResumeDocument } from "@shared/types";
import { render, screen, waitFor } from "@testing-library/react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DesignResumePdfPreview } from "./DesignResumePdfPreview";

const resizeObserverCallbacks = new Set<ResizeObserverCallback>();

vi.mock("@client/api", () => ({
  generateDesignResumePdf: vi.fn(),
  getDesignResumePdfBlob: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  trackProductEvent: vi.fn(),
}));

vi.mock("pdfjs-dist", () => {
  const getDocument = vi.fn();
  return {
    GlobalWorkerOptions: { workerSrc: "" },
    getDocument,
  };
});

const pdfjs = await import("pdfjs-dist");

const baseDraft = {
  id: "resume-1",
  title: "Resume",
  revision: 1,
  sourceResumeId: null,
  sourceMode: null,
  importedAt: null,
  createdAt: "2026-05-22T09:00:00.000Z",
  updatedAt: "2026-05-22T09:00:00.000Z",
  assets: [],
  resumeJson: {} as unknown as DesignResumeDocument["resumeJson"],
} satisfies DesignResumeDocument;

function setScrollMetrics(
  element: HTMLDivElement,
  metrics: {
    clientWidth?: number;
    clientHeight: number;
    scrollHeight: number;
    scrollTop: number;
  },
) {
  Object.defineProperties(element, {
    clientWidth: {
      configurable: true,
      value: metrics.clientWidth ?? 1000,
    },
    clientHeight: {
      configurable: true,
      value: metrics.clientHeight,
    },
    scrollHeight: {
      configurable: true,
      value: metrics.scrollHeight,
    },
    scrollTop: {
      configurable: true,
      writable: true,
      value: metrics.scrollTop,
    },
  });
}

function triggerResizeObservers(target: Element) {
  for (const callback of resizeObserverCallbacks) {
    callback(
      [
        {
          target,
          contentRect: {
            width: 1000,
            height: 1400,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            bottom: 1400,
            right: 1000,
            toJSON: () => ({}),
          },
        } as ResizeObserverEntry,
      ],
      {} as ResizeObserver,
    );
  }
}

describe("DesignResumePdfPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeObserverCallbacks.clear();

    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        private readonly callback: ResizeObserverCallback;

        constructor(callback: ResizeObserverCallback) {
          this.callback = callback;
          resizeObserverCallbacks.add(callback);
        }

        observe(target: Element) {
          this.callback(
            [
              {
                target,
                contentRect: {
                  width: 1000,
                  height: 1400,
                  x: 0,
                  y: 0,
                  top: 0,
                  left: 0,
                  bottom: 1400,
                  right: 1000,
                  toJSON: () => ({}),
                },
              } as ResizeObserverEntry,
            ],
            this,
          );
        }

        disconnect() {
          resizeObserverCallbacks.delete(this.callback);
        }

        unobserve() {}
      },
    );

    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
  });

  it("restores the same relative scroll position after preview regeneration", async () => {
    vi.mocked(api.generateDesignResumePdf)
      .mockResolvedValueOnce({
        fileName: "resume.pdf",
        pdfUrl: "/api/design-resume/pdf/one",
        generatedAt: "2026-05-22T09:00:01.000Z",
      })
      .mockResolvedValueOnce({
        fileName: "resume.pdf",
        pdfUrl: "/api/design-resume/pdf/two",
        generatedAt: "2026-05-22T09:00:02.000Z",
      });
    vi.mocked(api.getDesignResumePdfBlob).mockImplementation(async () => {
      return {
        arrayBuffer: async () => new ArrayBuffer(16),
      } as unknown as Blob;
    });

    vi.mocked(pdfjs.getDocument).mockImplementation(
      () =>
        ({
          promise: Promise.resolve({
            numPages: 2,
            destroy: vi.fn(),
            getPage: async () => ({
              getViewport: ({ scale }: { scale: number }) => ({
                width: 800 * scale,
                height: 1000 * scale,
              }),
              render: () => ({
                promise: Promise.resolve(),
              }),
            }),
          } as unknown as PDFDocumentProxy),
        }) as unknown as PDFDocumentLoadingTask,
    );

    const { rerender } = render(
      <DesignResumePdfPreview
        draft={baseDraft}
        pdfRenderer="typst"
        typstTheme="classic"
        isUpdatingRenderer={false}
        isDirty={false}
        saveState="idle"
      />,
    );

    const scrollContainer = await screen.findByTestId(
      "design-resume-pdf-scroll-container",
    );
    const viewer = scrollContainer as HTMLDivElement;

    setScrollMetrics(viewer, {
      clientWidth: 1000,
      clientHeight: 1000,
      scrollHeight: 3000,
      scrollTop: 0,
    });
    triggerResizeObservers(viewer);

    await waitFor(() => {
      expect(
        screen.getByLabelText("Resume Studio PDF page 2"),
      ).toBeInTheDocument();
    });

    viewer.scrollTop = 1000;

    rerender(
      <DesignResumePdfPreview
        draft={{ ...baseDraft, revision: 2 }}
        pdfRenderer="typst"
        typstTheme="classic"
        isUpdatingRenderer={false}
        isDirty={false}
        saveState="idle"
      />,
    );

    setScrollMetrics(viewer, {
      clientWidth: 1000,
      clientHeight: 1000,
      scrollHeight: 5000,
      scrollTop: 0,
    });

    await waitFor(() => {
      expect(viewer.scrollTop).toBe(2000);
    });
  });
});
