/**
 * Manual job import flow (paste JD -> infer -> review -> import).
 */

import {
  ArrowLeft,
  ClipboardPaste,
  FileText,
  Link,
  Loader2,
  Sparkles,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ManualJobDraft } from "../../shared/types";
import * as api from "../api";

type ManualImportStep = "paste" | "loading" | "review";

type ManualJobDraftState = {
  title: string;
  employer: string;
  jobUrl: string;
  applicationLink: string;
  location: string;
  salary: string;
  deadline: string;
  jobDescription: string;
  jobType: string;
  jobLevel: string;
  jobFunction: string;
  disciplines: string;
  degreeRequired: string;
  starting: string;
};

const emptyDraft: ManualJobDraftState = {
  title: "",
  employer: "",
  jobUrl: "",
  applicationLink: "",
  location: "",
  salary: "",
  deadline: "",
  jobDescription: "",
  jobType: "",
  jobLevel: "",
  jobFunction: "",
  disciplines: "",
  degreeRequired: "",
  starting: "",
};

const normalizeDraft = (
  draft?: ManualJobDraft | null,
  jd?: string,
): ManualJobDraftState => ({
  ...emptyDraft,
  title: draft?.title ?? "",
  employer: draft?.employer ?? "",
  jobUrl: draft?.jobUrl ?? "",
  applicationLink: draft?.applicationLink ?? "",
  location: draft?.location ?? "",
  salary: draft?.salary ?? "",
  deadline: draft?.deadline ?? "",
  jobDescription: jd ?? draft?.jobDescription ?? "",
  jobType: draft?.jobType ?? "",
  jobLevel: draft?.jobLevel ?? "",
  jobFunction: draft?.jobFunction ?? "",
  disciplines: draft?.disciplines ?? "",
  degreeRequired: draft?.degreeRequired ?? "",
  starting: draft?.starting ?? "",
});

const toPayload = (draft: ManualJobDraftState): ManualJobDraft => {
  const clean = (value: string) => {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  return {
    title: clean(draft.title),
    employer: clean(draft.employer),
    jobUrl: clean(draft.jobUrl),
    applicationLink: clean(draft.applicationLink),
    location: clean(draft.location),
    salary: clean(draft.salary),
    deadline: clean(draft.deadline),
    jobDescription: clean(draft.jobDescription),
    jobType: clean(draft.jobType),
    jobLevel: clean(draft.jobLevel),
    jobFunction: clean(draft.jobFunction),
    disciplines: clean(draft.disciplines),
    degreeRequired: clean(draft.degreeRequired),
    starting: clean(draft.starting),
  };
};

interface ManualImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (jobId: string) => void | Promise<void>;
}

export const ManualImportSheet: React.FC<ManualImportSheetProps> = ({
  open,
  onOpenChange,
  onImported,
}) => {
  const [step, setStep] = useState<ManualImportStep>("paste");
  const [rawDescription, setRawDescription] = useState("");
  const [fetchUrl, setFetchUrl] = useState("");
  const [isFetching, setIsFetching] = useState(false);
  const [draft, setDraft] = useState<ManualJobDraftState>(emptyDraft);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("paste");
      setRawDescription("");
      setFetchUrl("");
      setIsFetching(false);
      setDraft(emptyDraft);
      setWarning(null);
      setError(null);
      setIsImporting(false);
    }
  }, [open]);

  const stepIndex = step === "paste" ? 0 : step === "loading" ? 1 : 2;
  const stepLabel = ["Paste JD", "Infer details", "Review & import"][stepIndex];

  const canAnalyze = rawDescription.trim().length > 0 && step !== "loading";
  const canFetch =
    fetchUrl.trim().length > 0 && !isFetching && step === "paste";
  const canImport = useMemo(() => {
    if (step !== "review") return false;
    return (
      draft.title.trim().length > 0 &&
      draft.employer.trim().length > 0 &&
      draft.jobDescription.trim().length > 0
    );
  }, [draft, step]);

  const handleFetch = async () => {
    if (!fetchUrl.trim()) return;

    try {
      setError(null);
      setWarning(null);
      setIsFetching(true);

      // Fetch the URL content
      const fetchResponse = await api.fetchJobFromUrl({ url: fetchUrl.trim() });
      const fetchedContent = fetchResponse.content;
      const fetchedUrl = fetchResponse.url;

      setIsFetching(false);

      // Automatically proceed to analysis
      setStep("loading");
      const inferResponse = await api.inferManualJob({
        jobDescription: fetchedContent,
      });
      // Don't pass raw HTML as job description - let user fill it in or use inferred data
      const normalized = normalizeDraft(inferResponse.job);

      // Preserve the fetched URL
      if (!normalized.jobUrl) {
        normalized.jobUrl = fetchedUrl;
      }

      setDraft(normalized);
      setWarning(inferResponse.warning ?? null);
      setStep("review");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to fetch URL";
      setError(message);
      setIsFetching(false);
      setStep("paste");
    }
  };

  const handleAnalyze = async () => {
    if (!rawDescription.trim()) {
      setError("Paste a job description to continue.");
      return;
    }

    try {
      setError(null);
      setWarning(null);
      setStep("loading");
      const response = await api.inferManualJob({
        jobDescription: rawDescription,
      });
      const normalized = normalizeDraft(response.job, rawDescription.trim());
      // Preserve the fetched URL if we fetched from a URL
      if (draft.jobUrl && !normalized.jobUrl) {
        normalized.jobUrl = draft.jobUrl;
      }
      setDraft(normalized);
      setWarning(response.warning ?? null);
      setStep("review");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to analyze job description";
      setError(message);
      setStep("paste");
    }
  };

  const handleImport = async () => {
    if (!canImport) return;

    try {
      setIsImporting(true);
      const payload = toPayload(draft);
      const created = await api.importManualJob({ job: payload });
      toast.success("Job imported", {
        description: "The job is now in the discovered column.",
      });
      await onImported(created.id);
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import job";
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-hidden">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/60 bg-muted/30">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </span>
              Manual Import
            </SheetTitle>
            <SheetDescription>
              Paste a job description, review the AI draft, then import the
              role.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Step {stepIndex + 1} of 3</span>
                <span>{stepLabel}</span>
              </div>
              <div className="h-1 rounded-full bg-muted/40">
                <div
                  className="h-1 rounded-full bg-primary/60 transition-all"
                  style={{ width: `${((stepIndex + 1) / 3) * 100}%` }}
                />
              </div>
            </div>
            <Separator />
          </div>

          <div className="mt-4 flex-1 overflow-y-auto pr-1">
            {step === "paste" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="fetch-url"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Job URL (optional)
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="fetch-url"
                      value={fetchUrl}
                      onChange={(event) => setFetchUrl(event.target.value)}
                      placeholder="https://example.com/job-posting"
                      className="flex-1"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && canFetch) {
                          event.preventDefault();
                          handleFetch();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={isFetching}
                      className="gap-2 shrink-0"
                      onClick={async () => {
                        if (fetchUrl.trim()) {
                          handleFetch();
                        } else {
                          try {
                            const text = await navigator.clipboard.readText();
                            if (text) setFetchUrl(text.trim());
                          } catch {
                            // Clipboard access denied
                          }
                        }
                      }}
                    >
                      {isFetching ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : fetchUrl.trim() ? (
                        <Link className="h-4 w-4" />
                      ) : (
                        <ClipboardPaste className="h-4 w-4" />
                      )}
                      {isFetching
                        ? "Fetching..."
                        : fetchUrl.trim()
                          ? "Fetch"
                          : "Paste"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="raw-description"
                    className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Job description
                  </label>
                  <Textarea
                    id="raw-description"
                    value={rawDescription}
                    onChange={(event) => setRawDescription(event.target.value)}
                    placeholder="Paste the full job description here, or enter a URL above to fetch it..."
                    className="min-h-[200px] font-mono text-sm leading-relaxed"
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </div>
                )}

                <Button
                  onClick={fetchUrl.trim() ? handleFetch : handleAnalyze}
                  disabled={isFetching || (!canFetch && !canAnalyze)}
                  className="w-full h-10 gap-2"
                >
                  {isFetching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isFetching ? "Fetching..." : "Analyze JD"}
                </Button>
              </div>
            )}

            {step === "loading" && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <div className="text-sm font-semibold">
                  Analyzing job description
                </div>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Extracting title, company, location, and other details.
                </p>
              </div>
            )}

            {step === "review" && (
              <div className="space-y-4 pb-4">
                {warning && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                    {warning}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setStep("paste")}
                    className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Edit JD
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    Required: title, employer, description
                  </span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-title"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Title *
                    </label>
                    <Input
                      id="draft-title"
                      value={draft.title}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          title: event.target.value,
                        }))
                      }
                      placeholder="e.g. Junior Backend Engineer"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-employer"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Employer *
                    </label>
                    <Input
                      id="draft-employer"
                      value={draft.employer}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          employer: event.target.value,
                        }))
                      }
                      placeholder="e.g. Acme Labs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-location"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Location
                    </label>
                    <Input
                      id="draft-location"
                      value={draft.location}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          location: event.target.value,
                        }))
                      }
                      placeholder="e.g. London, UK"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-salary"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Salary
                    </label>
                    <Input
                      id="draft-salary"
                      value={draft.salary}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          salary: event.target.value,
                        }))
                      }
                      placeholder="e.g. GBP 45k-55k"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-deadline"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Deadline
                    </label>
                    <Input
                      id="draft-deadline"
                      value={draft.deadline}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          deadline: event.target.value,
                        }))
                      }
                      placeholder="e.g. 30 Sep 2025"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-jobType"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Job type
                    </label>
                    <Input
                      id="draft-jobType"
                      value={draft.jobType}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          jobType: event.target.value,
                        }))
                      }
                      placeholder="e.g. Full-time"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-jobLevel"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Job level
                    </label>
                    <Input
                      id="draft-jobLevel"
                      value={draft.jobLevel}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          jobLevel: event.target.value,
                        }))
                      }
                      placeholder="e.g. Graduate"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-jobFunction"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Job function
                    </label>
                    <Input
                      id="draft-jobFunction"
                      value={draft.jobFunction}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          jobFunction: event.target.value,
                        }))
                      }
                      placeholder="e.g. Software Engineering"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-disciplines"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Disciplines
                    </label>
                    <Input
                      id="draft-disciplines"
                      value={draft.disciplines}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          disciplines: event.target.value,
                        }))
                      }
                      placeholder="e.g. Computer Science"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-degreeRequired"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Degree required
                    </label>
                    <Input
                      id="draft-degreeRequired"
                      value={draft.degreeRequired}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          degreeRequired: event.target.value,
                        }))
                      }
                      placeholder="e.g. BSc or MSc"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-starting"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Starting
                    </label>
                    <Input
                      id="draft-starting"
                      value={draft.starting}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          starting: event.target.value,
                        }))
                      }
                      placeholder="e.g. Summer 2026"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-jobUrl"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Job URL
                    </label>
                    <Input
                      id="draft-jobUrl"
                      value={draft.jobUrl}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          jobUrl: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="draft-applicationLink"
                      className="text-xs font-medium text-muted-foreground"
                    >
                      Application link
                    </label>
                    <Input
                      id="draft-applicationLink"
                      value={draft.applicationLink}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          applicationLink: event.target.value,
                        }))
                      }
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="draft-jobDescription"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Job description *
                  </label>
                  <Textarea
                    id="draft-jobDescription"
                    value={draft.jobDescription}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        jobDescription: event.target.value,
                      }))
                    }
                    className="min-h-[200px] font-mono text-sm leading-relaxed"
                    placeholder="Paste the job description..."
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <Separator />
                  <Button
                    onClick={handleImport}
                    disabled={!canImport || isImporting}
                    className={cn(
                      "w-full h-10 gap-2",
                      !canImport && "opacity-70",
                    )}
                  >
                    {isImporting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    {isImporting ? "Importing..." : "Import job"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
