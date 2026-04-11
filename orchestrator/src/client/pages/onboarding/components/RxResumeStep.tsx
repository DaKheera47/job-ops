import { ReactiveResumeConfigPanel } from "@client/components/ReactiveResumeConfigPanel";
import type { PdfRenderer } from "@shared/types.js";
import type React from "react";
import type { ValidationState } from "../types";

export const RxResumeStep: React.FC<{
  isBusy: boolean;
  pdfRenderer: PdfRenderer;
  rxresumeApiKey: string;
  rxresumeUrl: string;
  rxresumeValidation: ValidationState;
  rxresumeApiKeyHint: string | null | undefined;
  onPdfRendererChange: (renderer: PdfRenderer) => void;
  onRxresumeApiKeyChange: (value: string) => void;
  onRxresumeUrlChange: (value: string) => void;
}> = ({
  isBusy,
  onPdfRendererChange,
  onRxresumeApiKeyChange,
  onRxresumeUrlChange,
  pdfRenderer,
  rxresumeApiKey,
  rxresumeApiKeyHint,
  rxresumeUrl,
  rxresumeValidation,
}) => (
  <ReactiveResumeConfigPanel
    pdfRenderer={pdfRenderer}
    onPdfRendererChange={onPdfRendererChange}
    disabled={isBusy}
    showValidationStatus
    validationStatus={rxresumeValidation}
    v5={{
      apiKey: rxresumeApiKey,
      onApiKeyChange: onRxresumeApiKeyChange,
      helper: rxresumeApiKeyHint
        ? "Leave blank to keep the saved v5 API key."
        : undefined,
    }}
    shared={{
      baseUrl: rxresumeUrl,
      onBaseUrlChange: onRxresumeUrlChange,
    }}
  />
);
