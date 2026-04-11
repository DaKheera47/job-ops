import { Upload } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { ResumeSetupMode, ValidationState } from "../types";
import { InlineValidation } from "./InlineValidation";
import { RxResumeStep } from "./RxResumeStep";

export const BaseResumeStep: React.FC<{
  baseResumeValidation: ValidationState;
  baseResumeValue: string | null;
  hasRxResumeAccess: boolean;
  isBusy: boolean;
  isImportingResume: boolean;
  isResumeReady: boolean;
  isRxResumeSelfHosted: boolean;
  resumeSetupMode: ResumeSetupMode;
  rxresumeApiKey: string;
  rxresumeApiKeyHint: string | null | undefined;
  rxresumeUrl: string;
  rxresumeValidation: ValidationState;
  onImportResumeFile: (file: File) => Promise<void>;
  onResumeSetupModeChange: (mode: ResumeSetupMode) => void;
  onRxresumeApiKeyChange: (value: string) => void;
  onRxresumeSelfHostedChange: (next: boolean) => void;
  onRxresumeUrlChange: (value: string) => void;
  onTemplateResumeChange: (value: string | null) => void;
}> = ({
  baseResumeValidation,
  baseResumeValue,
  hasRxResumeAccess,
  isBusy,
  isImportingResume,
  isResumeReady,
  isRxResumeSelfHosted,
  resumeSetupMode,
  rxresumeApiKey,
  rxresumeApiKeyHint,
  rxresumeUrl,
  rxresumeValidation,
  onImportResumeFile,
  onResumeSetupModeChange,
  onRxresumeApiKeyChange,
  onRxresumeSelfHostedChange,
  onRxresumeUrlChange,
  onTemplateResumeChange,
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

      <RadioGroup
        value={resumeSetupMode}
        onValueChange={(value) =>
          onResumeSetupModeChange(value === "rxresume" ? "rxresume" : "upload")
        }
        className="grid gap-4 lg:grid-cols-2"
      >
        {[
          {
            value: "upload",
            title: "Upload a PDF or DOCX",
            description:
              "Create a local Design Resume directly in Job Ops from your existing file.",
          },
          {
            value: "rxresume",
            title: "Use Reactive Resume",
            description:
              "Connect with a v5 API key and select a resume you already maintain there.",
          },
        ].map((option) => {
          const checked = resumeSetupMode === option.value;
          const radioId = `resume-setup-${option.value}`;
          return (
            <label
              key={option.value}
              htmlFor={radioId}
              className={cn(
                "flex cursor-pointer items-start gap-4 rounded-xl border p-4 transition-colors",
                checked
                  ? "border-primary bg-muted/40"
                  : "border-border/60 hover:bg-muted/20",
              )}
            >
              <RadioGroupItem
                id={radioId}
                value={option.value}
                className="mt-1"
              />
              <div className="space-y-1">
                <div className="text-base font-medium text-foreground">
                  {option.title}
                </div>
                <div className="text-sm leading-6 text-muted-foreground">
                  {option.description}
                </div>
              </div>
            </label>
          );
        })}
      </RadioGroup>

      {resumeSetupMode === "upload" ? (
        <>
          <div className="rounded-xl border border-border/60 bg-muted/10 p-5">
            <div className="space-y-2">
              <div className="text-sm font-medium">
                Upload a PDF or DOCX resume
              </div>
              <p className="text-sm text-muted-foreground">
                Job Ops will send the file directly to your configured AI model
                and store the validated structured result as your local Design
                Resume.
              </p>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isBusy || isImportingResume}
              >
                <Upload className="h-4 w-4" />
                {isImportingResume
                  ? "Importing resume..."
                  : "Upload resume file"}
              </Button>
              <div className="text-xs text-muted-foreground">
                Supported formats: PDF and DOCX.
              </div>
            </div>
          </div>

          {(baseResumeValidation.checked || rxresumeValidation.checked) &&
          !hasRxResumeAccess &&
          !baseResumeValidation.valid ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
              Upload a resume here, or switch to the Reactive Resume option if
              you want to import from an existing template resume instead.
            </div>
          ) : null}

          <InlineValidation
            state={baseResumeValidation}
            successMessage="Your base resume is loaded and ready."
          />
        </>
      ) : (
        <>
          <RxResumeStep
            baseResumeValue={baseResumeValue}
            isBusy={isBusy}
            isResumeReady={isResumeReady}
            isSelfHosted={isRxResumeSelfHosted}
            rxresumeApiKey={rxresumeApiKey}
            rxresumeApiKeyHint={rxresumeApiKeyHint}
            rxresumeUrl={rxresumeUrl}
            rxresumeValidation={rxresumeValidation}
            onRxresumeApiKeyChange={onRxresumeApiKeyChange}
            onRxresumeUrlChange={onRxresumeUrlChange}
            onSelfHostedChange={onRxresumeSelfHostedChange}
            onTemplateResumeChange={onTemplateResumeChange}
          />
          <InlineValidation
            state={baseResumeValidation}
            successMessage="Your base resume is loaded and ready."
          />
        </>
      )}
    </div>
  );
};
