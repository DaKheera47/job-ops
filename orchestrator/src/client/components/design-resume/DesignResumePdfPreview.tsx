import * as api from "@client/api";
import type { DesignResumeDocument } from "@shared/types";
import { FileText, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type DesignResumePdfPreviewProps = {
  draft: DesignResumeDocument;
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
};

type PreviewState = "idle" | "waiting-for-save" | "loading" | "ready" | "error";

export function DesignResumePdfPreview({
  draft,
  isDirty,
  saveState,
}: DesignResumePdfPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isFrameLoading, setIsFrameLoading] = useState(false);
  const requestSequence = useRef(0);
  const lastLoadedKey = useRef<string | null>(null);

  const revisionKey = useMemo(
    () => `${draft.id}:${draft.revision}`,
    [draft.id, draft.revision],
  );

  useEffect(() => {
    if (saveState === "error") {
      setIsFrameLoading(false);
      return;
    }

    if (isDirty || saveState === "saving") {
      setPreviewState("waiting-for-save");
      setIsFrameLoading(false);
      return;
    }

    if (lastLoadedKey.current === revisionKey) {
      return;
    }

    const requestId = ++requestSequence.current;
    lastLoadedKey.current = revisionKey;
    setPreviewState("loading");
    setPreviewError(null);
    setIsFrameLoading(true);

    void api
      .generateDesignResumePdf()
      .then((generated) => {
        if (requestSequence.current !== requestId) return;
        setPdfUrl(`${generated.pdfUrl}#toolbar=0&navpanes=0&view=FitH`);
        setPreviewState("ready");
      })
      .catch((error: unknown) => {
        if (requestSequence.current !== requestId) return;
        lastLoadedKey.current = null;
        setPreviewError(
          error instanceof Error
            ? error.message
            : "Could not render the PDF preview.",
        );
        setPreviewState("error");
        setIsFrameLoading(false);
      });
  }, [isDirty, revisionKey, saveState]);

  const showLoader =
    previewState === "loading" ||
    previewState === "waiting-for-save" ||
    isFrameLoading;

  return (
    <div className="relative flex h-full min-h-0 items-center justify-center overflow-hidden bg-muted/10 p-6 xl:p-8">
      <div className="relative h-full min-h-[720px] w-full overflow-hidden border border-border/70 bg-white shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
        {pdfUrl ? (
          <iframe
            key={pdfUrl}
            src={pdfUrl}
            title="Design Resume PDF preview"
            className="h-full w-full bg-white"
            onLoad={() => {
              setIsFrameLoading(false);
              setPreviewState("ready");
            }}
          />
        ) : null}

        {showLoader ? (
          <div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-[2px]">
            <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl border border-border/70 bg-background/95 px-6 py-5 text-center shadow-lg">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <div className="text-sm font-medium text-foreground">
                {previewState === "waiting-for-save"
                  ? "Saving changes before updating the preview"
                  : "Rendering PDF preview"}
              </div>
            </div>
          </div>
        ) : null}

        {previewState === "error" ? (
          <div className="absolute inset-0 grid place-items-center bg-background/80">
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
