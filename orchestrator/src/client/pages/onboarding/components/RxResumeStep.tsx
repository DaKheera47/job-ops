import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import { PDF_RENDERER_LABELS, type PdfRenderer } from "@shared/types.js";
import type React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ValidationState } from "../types";
import { InlineValidation } from "./InlineValidation";

export const RxResumeStep: React.FC<{
  isBusy: boolean;
  isSelfHosted: boolean;
  pdfRenderer: PdfRenderer;
  rxresumeApiKey: string;
  rxresumeUrl: string;
  rxresumeValidation: ValidationState;
  rxresumeApiKeyHint: string | null | undefined;
  onSelfHostedChange: (next: boolean) => void;
  onPdfRendererChange: (renderer: PdfRenderer) => void;
  onRxresumeApiKeyChange: (value: string) => void;
  onRxresumeUrlChange: (value: string) => void;
}> = ({
  isBusy,
  isSelfHosted,
  onPdfRendererChange,
  onRxresumeApiKeyChange,
  onRxresumeUrlChange,
  onSelfHostedChange,
  pdfRenderer,
  rxresumeApiKey,
  rxresumeApiKeyHint,
  rxresumeUrl,
  rxresumeValidation,
}) => (
  <div className="space-y-6">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-5">
        <SettingsInput
          label="v5 API key"
          inputProps={{
            name: "rxresumeApiKey",
            value: rxresumeApiKey,
            onChange: (event) =>
              onRxresumeApiKeyChange(event.currentTarget.value),
          }}
          type="password"
          placeholder="Enter v5 API key"
          helper={
            rxresumeApiKeyHint
              ? "Leave blank to keep the saved v5 API key."
              : undefined
          }
          disabled={isBusy}
        />

        <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-3">
          <label
            htmlFor="rxresume-self-hosted"
            className="flex cursor-pointer items-start gap-3"
          >
            <Checkbox
              id="rxresume-self-hosted"
              checked={isSelfHosted}
              onCheckedChange={(checked) =>
                onSelfHostedChange(Boolean(checked))
              }
              disabled={isBusy}
            />
            <div className="space-y-1">
              <div className="text-sm font-medium">
                Self-hosted Reactive Resume?
              </div>
              <p className="text-xs text-muted-foreground">
                Turn this on only if you run your own instance and need a custom
                base URL.
              </p>
            </div>
          </label>
        </div>

        {isSelfHosted ? (
          <SettingsInput
            label="Custom URL"
            inputProps={{
              name: "rxresumeUrl",
              value: rxresumeUrl,
              onChange: (event) =>
                onRxresumeUrlChange(event.currentTarget.value),
            }}
            type="url"
            placeholder="https://resume.example.com"
            helper="Enter the root URL for your self-hosted Reactive Resume instance."
            disabled={isBusy}
          />
        ) : null}
      </div>

      <div className="space-y-4 rounded-lg border border-border/60 bg-muted/10 p-4">
        <div className="space-y-2">
          <label htmlFor="pdfRenderer" className="text-sm font-medium">
            PDF renderer
          </label>
          <Select
            value={pdfRenderer}
            onValueChange={(value) =>
              onPdfRendererChange(value === "latex" ? "latex" : "rxresume")
            }
            disabled={isBusy}
          >
            <SelectTrigger id="pdfRenderer">
              <SelectValue placeholder="Choose PDF renderer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rxresume">
                {PDF_RENDERER_LABELS.rxresume}
              </SelectItem>
              <SelectItem value="latex">{PDF_RENDERER_LABELS.latex}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          {pdfRenderer === "latex"
            ? "LaTeX renders PDFs locally with the built-in template."
            : "RxResume export uses Reactive Resume to render PDFs."}
        </p>
      </div>
    </div>

    <InlineValidation state={rxresumeValidation} />
  </div>
);
