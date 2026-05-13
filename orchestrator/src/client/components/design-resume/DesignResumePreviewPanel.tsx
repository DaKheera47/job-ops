import type { DesignResumeDocument, PdfRenderer } from "@shared/types";
import { PDF_RENDERER_LABELS } from "@shared/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DesignResumePdfPreview } from "./DesignResumePdfPreview";

type DesignResumePreviewPanelProps = {
  draft: DesignResumeDocument;
  pdfRenderer: PdfRenderer;
  isUpdatingRenderer: boolean;
  isDirty: boolean;
  saveState: "idle" | "saving" | "saved" | "error";
  onPdfRendererChange: (renderer: PdfRenderer) => void;
  className?: string;
};

export function DesignResumePreviewPanel({
  draft,
  pdfRenderer,
  isUpdatingRenderer,
  isDirty,
  saveState,
  onPdfRendererChange,
  className,
}: DesignResumePreviewPanelProps) {
  return (
    <section
      className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 py-4">
        <label
          htmlFor="design-resume-template"
          className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground"
        >
          Template
        </label>
        <Select
          value={pdfRenderer}
          onValueChange={(value) =>
            onPdfRendererChange(value === "latex" ? "latex" : "rxresume")
          }
          disabled={isUpdatingRenderer}
        >
          <SelectTrigger id="design-resume-template" className="w-full sm:w-72">
            <SelectValue placeholder="Choose a template" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rxresume">
              {PDF_RENDERER_LABELS.rxresume}
            </SelectItem>
            <SelectItem value="latex">{PDF_RENDERER_LABELS.latex}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <DesignResumePdfPreview
          draft={draft}
          pdfRenderer={pdfRenderer}
          isUpdatingRenderer={isUpdatingRenderer}
          isDirty={isDirty}
          saveState={saveState}
        />
      </div>
    </section>
  );
}
