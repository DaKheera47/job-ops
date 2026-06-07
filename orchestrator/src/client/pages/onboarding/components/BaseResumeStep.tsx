import { FileText, Upload } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import type { LlmProviderId } from "@/client/pages/settings/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/lib/utils";
import type { ResumeSetupMode, ValidationState } from "../types";
import { InlineValidation } from "./InlineValidation";
import { RxResumeStep } from "./RxResumeStep";

const RESUME_IMPORT_TOTAL_MS = 25_000;
const CODEX_RESUME_IMPORT_TOTAL_MS = 60_000;
const RESUME_IMPORT_TICK_MS = 250;
const RESUME_IMPORT_STEPS = [
  "Reading file",
  "Preparing import",
  "Extracting resume text",
  "Building Resume Studio document",
  "Saving baseline",
  "Finalizing setup",
] as const;
const DEFAULT_LONG_RUNNING_MESSAGE =
  "Still working. Larger PDFs and DOCX files can take a little longer.";
const CODEX_LONG_RUNNING_MESSAGE =
  "Still working. Codex imports can take around a minute for larger resumes.";

function getResumeImportProgressProfile(selectedProvider?: LlmProviderId) {
  if (selectedProvider === "codex") {
    return {
      totalMs: CODEX_RESUME_IMPORT_TOTAL_MS,
      longRunningMessage: CODEX_LONG_RUNNING_MESSAGE,
    };
  }

  return {
    totalMs: RESUME_IMPORT_TOTAL_MS,
    longRunningMessage: DEFAULT_LONG_RUNNING_MESSAGE,
  };
}

function ResumeImportProgress({
  fileName,
  selectedProvider,
}: {
  fileName: string | null;
  selectedProvider?: LlmProviderId;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const progressProfile = getResumeImportProgressProfile(selectedProvider);

  useEffect(() => {
    setElapsedMs(0);
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, RESUME_IMPORT_TICK_MS);

    return () => window.clearInterval(interval);
  }, []);

  const cappedElapsedMs = Math.min(elapsedMs, progressProfile.totalMs);
  const activeStepIndex = Math.min(
    RESUME_IMPORT_STEPS.length - 1,
    Math.floor(
      (cappedElapsedMs / progressProfile.totalMs) * RESUME_IMPORT_STEPS.length,
    ),
  );
  const progressValue = Math.min(
    96,
    Math.max(6, Math.round((cappedElapsedMs / progressProfile.totalMs) * 96)),
  );
  const isLongRunning = elapsedMs >= progressProfile.totalMs;

  return (
    <output
      className="block rounded-lg border border-border/60 bg-muted/10 p-5"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background text-muted-foreground">
          <FileText className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-medium">Importing resume</div>
              <div className="truncate text-xs text-muted-foreground">
                {fileName ?? "Selected resume file"}
              </div>
            </div>
            <div className="text-xs tabular-nums text-muted-foreground">
              {progressValue}%
            </div>
          </div>
          <Progress
            value={progressValue}
            className="h-1.5"
            aria-label="Resume import progress"
          />
          <p className="bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-clip-text text-sm leading-6 text-transparent motion-safe:animate-pulse">
            {isLongRunning
              ? progressProfile.longRunningMessage
              : RESUME_IMPORT_STEPS[activeStepIndex]}
          </p>
        </div>
      </div>
    </output>
  );
}

export const BaseResumeStep: React.FC<{
  baseResumeValidation: ValidationState;
  baseResumeValue: string | null;
  hasRxResumeAccess: boolean;
  importingResumeFileName: string | null;
  isBusy: boolean;
  isImportingResume: boolean;
  isResumeReady: boolean;
  isRxResumeSelfHosted: boolean;
  resumeSetupMode: ResumeSetupMode;
  rxresumeApiKey: string;
  rxresumeApiKeyHint: string | null | undefined;
  rxresumeUrl: string;
  rxresumeValidation: ValidationState;
  selectedProvider?: LlmProviderId;
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
  importingResumeFileName,
  isBusy,
  isImportingResume,
  isResumeReady,
  isRxResumeSelfHosted,
  resumeSetupMode,
  rxresumeApiKey,
  rxresumeApiKeyHint,
  rxresumeUrl,
  rxresumeValidation,
  selectedProvider,
  onImportResumeFile,
  onResumeSetupModeChange,
  onRxresumeApiKeyChange,
  onRxresumeSelfHostedChange,
  onRxresumeUrlChange,
  onTemplateResumeChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6" data-onboarding-target="resume-options">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/json,.json"
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
            title: "Upload a file",
            description:
              "Turn a PDF, DOCX, or Reactive Resume JSON into the baseline Job Ops uses for matching and tailoring.",
          },
          {
            value: "rxresume",
            title: "Use Reactive Resume",
            description:
              "Connect an existing Reactive Resume so Job Ops can assess fit and build applications from it.",
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
          {isImportingResume ? (
            <ResumeImportProgress
              fileName={importingResumeFileName}
              selectedProvider={selectedProvider}
            />
          ) : (
            <div className="rounded-lg border border-border/60 bg-muted/10 p-5">
              <div className="space-y-2">
                <div className="text-sm font-medium">Upload a resume file</div>
                <p className="text-sm text-muted-foreground">
                  Job Ops imports Reactive Resume JSON directly. PDF and DOCX
                  files are sent to your configured AI model and stored as a
                  local Design Resume. That resume drives job matching, fit
                  assessment, search terms, and application workflows.
                </p>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isBusy}
                >
                  <Upload className="h-4 w-4" />
                  Upload resume file
                </Button>
                <div className="text-xs text-muted-foreground">
                  Supported formats: PDF, DOCX, and Reactive Resume JSON.
                </div>
              </div>
            </div>
          )}

          <InlineValidation
            state={baseResumeValidation}
            successMessage="Your base resume is loaded and ready."
          />
        </>
      ) : (
        <RxResumeStep
          baseResumeValue={baseResumeValue}
          hasRxResumeAccess={hasRxResumeAccess}
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
      )}
    </div>
  );
};
