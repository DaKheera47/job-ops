import { Upload } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ValidationState } from "../types";
import { InlineValidation } from "./InlineValidation";

export const BaseResumeStep: React.FC<{
  baseResumeValidation: ValidationState;
  hasRxResumeAccess: boolean;
  isBusy: boolean;
  isImportingResume: boolean;
  onImportResumeFile: (file: File) => Promise<void>;
}> = ({
  baseResumeValidation,
  hasRxResumeAccess,
  isBusy,
  isImportingResume,
  onImportResumeFile,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            void onImportResumeFile(file);
          }
          event.currentTarget.value = "";
        }}
      />

      <div className="max-w-2xl text-sm leading-6 text-muted-foreground">
        Uploading a resume creates a local Design Resume inside Job Ops.
        Reactive Resume is optional. If you prefer that route, continue to the
        next step and connect it there instead.
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/10 p-5">
        <div className="space-y-2">
          <div className="text-sm font-medium">Upload a PDF or DOCX resume</div>
          <p className="text-sm text-muted-foreground">
            Job Ops will send the file directly to your configured AI model and
            store the validated structured result as your local Design Resume.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy || isImportingResume}
          >
            <Upload className="h-4 w-4" />
            {isImportingResume ? "Importing resume..." : "Upload resume file"}
          </Button>
          <div className="text-xs text-muted-foreground">
            Supported formats: PDF and DOCX.
          </div>
        </div>
      </div>

      {!hasRxResumeAccess && !baseResumeValidation.valid ? (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          Upload a resume here, or continue to the Reactive Resume step if you
          want to import from an existing template resume instead.
        </div>
      ) : null}

      <InlineValidation state={baseResumeValidation} />
    </div>
  );
};
