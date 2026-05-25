import * as api from "@client/api";
import type {
  DesignResumeDocument,
  PdfRenderer,
  TypstTheme,
} from "@shared/types";
import { FileText, Loader2, Minus, Plus } from "lucide-react";
import {
  GlobalWorkerOptions,
  getDocument,
  type PDFDocumentProxy,
} from "pdfjs-dist";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackProductEvent } from "@/lib/analytics";

type DesignResumePdfPreviewProps = {
  draft: DesignResumeDocument;
  pdfRenderer: PdfRenderer;
  typstTheme: TypstTheme;
  isUpdatingRenderer: boolean;
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
};

type PreviewState = "idle" | "waiting-for-save" | "loading" | "ready" | "error";

type PreviewScrollSnapshot = {
  topRatio: number;
  leftRatio: number;
};

const PDF_PAGE_HORIZONTAL_PADDING = 24;
const PDF_MAX_RENDER_WIDTH = 900;
const PDF_ZOOM_STEP = 0.1;
const PDF_ZOOM_MIN = 0.5;
const PDF_ZOOM_MAX = 2;

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url,
).toString();

function captureScrollSnapshot(
  element: HTMLDivElement | null,
): PreviewScrollSnapshot | null {
  if (!element) return null;
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
  return {
    topRatio: maxScrollTop > 0 ? element.scrollTop / maxScrollTop : 0,
    leftRatio: maxScrollLeft > 0 ? element.scrollLeft / maxScrollLeft : 0,
  };
}

function restoreScrollSnapshot(
  element: HTMLDivElement | null,
  snapshot: PreviewScrollSnapshot | null,
): void {
  if (!element || !snapshot) return;
  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  const maxScrollLeft = Math.max(0, element.scrollWidth - element.clientWidth);
  element.scrollTop = Math.round(snapshot.topRatio * maxScrollTop);
  element.scrollLeft = Math.round(snapshot.leftRatio * maxScrollLeft);
}

function bucketLatencyMs(latencyMs: number): string {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return "unknown";
  if (latencyMs < 500) return "lt_500ms";
  if (latencyMs < 1_000) return "500_1000ms";
  if (latencyMs < 2_500) return "1000_2500ms";
  if (latencyMs < 5_000) return "2500_5000ms";
  return "5000ms_plus";
}

export function DesignResumePdfPreview({
  draft,
  pdfRenderer,
  typstTheme,
  isUpdatingRenderer,
  isDirty,
  saveState,
}: DesignResumePdfPreviewProps) {
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [fitWidth, setFitWidth] = useState(0);
  const [isRenderingPages, setIsRenderingPages] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const requestSequence = useRef(0);
  const lastLoadedKey = useRef<string | null>(null);
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const canvasRefs = useRef(new Map<number, HTMLCanvasElement>());
  const pendingScrollRestoreRef = useRef<PreviewScrollSnapshot | null>(null);
  const latestPdfDocumentRef = useRef<PDFDocumentProxy | null>(null);

  const revisionKey = useMemo(
    () => `${draft.id}:${draft.revision}:${pdfRenderer}:${typstTheme}`,
    [draft.id, draft.revision, pdfRenderer, typstTheme],
  );
  const renderWidth = Math.max(0, Math.floor(fitWidth * zoomLevel));
  const zoomPercentLabel = `${Math.round(zoomLevel * 100)}%`;

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || typeof ResizeObserver === "undefined") return;

    const updateWidth = () => {
      const nextWidth = Math.max(
        320,
        Math.min(
          PDF_MAX_RENDER_WIDTH,
          Math.floor(viewer.clientWidth - PDF_PAGE_HORIZONTAL_PADDING * 2),
        ),
      );
      setFitWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    updateWidth();
    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(viewer);
    return () => observer.disconnect();
  }, []);

  const updateZoomLevel = (nextZoomLevel: number) => {
    pendingScrollRestoreRef.current = captureScrollSnapshot(viewerRef.current);
    setZoomLevel(nextZoomLevel);
  };

  const handleZoomOut = () => {
    updateZoomLevel(
      Math.max(PDF_ZOOM_MIN, Number((zoomLevel - PDF_ZOOM_STEP).toFixed(2))),
    );
  };

  const handleZoomIn = () => {
    updateZoomLevel(
      Math.min(PDF_ZOOM_MAX, Number((zoomLevel + PDF_ZOOM_STEP).toFixed(2))),
    );
  };

  const handleZoomReset = () => {
    updateZoomLevel(1);
  };

  useEffect(() => {
    if (saveState === "error") {
      setIsRenderingPages(false);
      setPreviewState((current) =>
        current === "waiting-for-save" ? "error" : current,
      );
      setPreviewError("Changes could not be saved. Please try again.");
      return;
    }

    if (isUpdatingRenderer || isDirty || saveState === "saving") {
      setPreviewState("waiting-for-save");
      setIsRenderingPages(false);
      return;
    }

    if (lastLoadedKey.current === revisionKey) {
      return;
    }

    const requestId = ++requestSequence.current;
    const startedAt = Date.now();
    pendingScrollRestoreRef.current = captureScrollSnapshot(viewerRef.current);
    lastLoadedKey.current = revisionKey;
    setPreviewState("loading");
    setPreviewError(null);
    setIsRenderingPages(true);

    void api
      .generateDesignResumePdf()
      .then(async (generated) => {
        const blob = await api.getDesignResumePdfBlob(generated.pdfUrl);
        return blob.arrayBuffer();
      })
      .then((pdfData) => {
        if (requestSequence.current !== requestId) {
          return null;
        }
        return getDocument({ data: pdfData }).promise;
      })
      .then((nextDocument) => {
        if (!nextDocument) return;
        if (requestSequence.current !== requestId) {
          void nextDocument.destroy();
          return;
        }

        const previousDocument = latestPdfDocumentRef.current;
        latestPdfDocumentRef.current = nextDocument;
        setPdfDocument(nextDocument);
        setPageCount(nextDocument.numPages);
        void previousDocument?.destroy();

        trackProductEvent("resume_studio_pdf_preview_completed", {
          renderer: pdfRenderer,
          theme: typstTheme,
          result: "success",
          latency_bucket: bucketLatencyMs(Date.now() - startedAt),
        });
      })
      .catch((error: unknown) => {
        if (requestSequence.current !== requestId) return;
        lastLoadedKey.current = null;
        setPdfDocument(null);
        setPageCount(0);
        setPreviewError(
          error instanceof Error
            ? error.message
            : "Could not render the PDF preview.",
        );
        setPreviewState("error");
        setIsRenderingPages(false);
        trackProductEvent("resume_studio_pdf_preview_completed", {
          renderer: pdfRenderer,
          theme: typstTheme,
          result: "error",
          latency_bucket: bucketLatencyMs(Date.now() - startedAt),
        });
      });
  }, [
    isDirty,
    isUpdatingRenderer,
    pdfRenderer,
    revisionKey,
    saveState,
    typstTheme,
  ]);

  useEffect(() => {
    return () => {
      void latestPdfDocumentRef.current?.destroy();
    };
  }, []);

  useEffect(() => {
    if (!pdfDocument || renderWidth <= 0 || pageCount <= 0) return;

    let cancelled = false;
    setIsRenderingPages(true);

    void (async () => {
      const outputScale = Math.max(1, window.devicePixelRatio || 1);

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (cancelled) return;

        const canvas = canvasRefs.current.get(pageNumber);
        if (!canvas) continue;

        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = renderWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const context = canvas.getContext("2d");
        if (!context) continue;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

        const renderTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
        });
        await renderTask.promise;
      }

      if (cancelled) return;

      restoreScrollSnapshot(viewerRef.current, pendingScrollRestoreRef.current);
      pendingScrollRestoreRef.current = null;
      setIsRenderingPages(false);
      setPreviewState("ready");
    })().catch((error: unknown) => {
      if (cancelled) return;
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Could not render the PDF preview.",
      );
      setPreviewState("error");
      setIsRenderingPages(false);
    });

    return () => {
      cancelled = true;
    };
  }, [pageCount, pdfDocument, renderWidth]);

  const showLoader =
    previewState === "loading" ||
    previewState === "waiting-for-save" ||
    isRenderingPages;

  return (
    <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-card">
      <div className="relative h-full min-h-0 w-full overflow-hidden border border-border/70 shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        <div
          ref={viewerRef}
          data-testid="design-resume-pdf-scroll-container"
          className="h-full overflow-auto bg-[#d9d9d9] px-6 py-8"
        >
          <div className="mx-auto flex min-w-fit flex-col items-center gap-6">
            {Array.from({ length: pageCount }, (_, index) => index + 1).map(
              (pageNumber) => (
                <div
                  key={pageNumber}
                  className="w-fit rounded-sm bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]"
                >
                  <canvas
                    ref={(canvas) => {
                      if (canvas) {
                        canvasRefs.current.set(pageNumber, canvas);
                      } else {
                        canvasRefs.current.delete(pageNumber);
                      }
                    }}
                    aria-label={`Resume Studio PDF page ${pageNumber}`}
                    className="block"
                  />
                </div>
              ),
            )}
          </div>
        </div>

        <div className="absolute right-4 top-4 z-10 flex items-center gap-2 rounded-full border border-border/70 bg-card/90 px-2 py-2 shadow-lg backdrop-blur">
          <button
            type="button"
            aria-label="Zoom out PDF preview"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleZoomOut}
            disabled={zoomLevel <= PDF_ZOOM_MIN || showLoader}
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-1 text-xs font-medium text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleZoomReset}
            disabled={zoomLevel === 1 || showLoader}
          >
            {zoomPercentLabel}
          </button>
          <button
            type="button"
            aria-label="Zoom in PDF preview"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            onClick={handleZoomIn}
            disabled={zoomLevel >= PDF_ZOOM_MAX || showLoader}
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {showLoader ? (
          <div className="absolute inset-0 grid place-items-center bg-card/70 backdrop-blur-[2px]">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border/70 bg-card px-6 py-5 text-center shadow-lg">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <div className="text-sm font-medium text-foreground">
                {isUpdatingRenderer
                  ? "Updating template before refreshing the preview"
                  : previewState === "waiting-for-save"
                    ? "Saving changes before updating the preview"
                    : "Rendering PDF preview"}
              </div>
            </div>
          </div>
        ) : null}

        {previewState === "error" ? (
          <div className="absolute inset-0 grid place-items-center bg-card backdrop-blur-[2px]">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-6 py-5 text-center">
              <FileText className="h-6 w-6 text-rose-300" />
              <div className="text-sm font-medium text-rose-200">
                Preview unavailable
              </div>
              <div className="text-xs leading-6 text-rose-200/80">
                {previewError ?? "Could not render the PDF preview."}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
