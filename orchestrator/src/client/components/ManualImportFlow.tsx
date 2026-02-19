import * as api from "@client/api";
import type { ManualJobDraft } from "@shared/types.js";
import {
  ArrowLeft,
  ClipboardPaste,
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
import { Textarea } from "@/components/ui/textarea";

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

const STEP_INDEX_BY_ID: Record<ManualImportStep, number> = {
  paste: 0,
  loading: 1,
  review: 2,
};

const STEP_LABEL_BY_ID: Record<ManualImportStep, string> = {
  paste: "Paste JD",
  loading: "Infer details",
  review: "Review & import",
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

interface ManualImportFlowProps {
  active: boolean;
  onImported: (jobId: string) => void | Promise<void>;
  onClose: () => void;
}

export const ManualImportFlow: React.FC<ManualImportFlowProps> = ({
  active,
  onImported,
  onClose,
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
    if (active) return;
    setStep("paste");
    setRawDescription("");
    setFetchUrl("");
    setIsFetching(false);
    setDraft(emptyDraft);
    setWarning(null);
    setError(null);
    setIsImporting(false);
  }, [active]);

  const stepIndex = STEP_INDEX_BY_ID[step];
  const stepLabel = STEP_LABEL_BY_ID[step];

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

      const fetchResponse = await api.fetchJobFromUrl({ url: fetchUrl.trim() });
      const fetchedContent = fetchResponse.content;
      const fetchedUrl = fetchResponse.url;

      setIsFetching(false);
      setStep("loading");
      const inferResponse = await api.inferManualJob({
        jobDescription: fetchedContent,
      });
      const normalized = normalizeDraft(inferResponse.job);

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
        description: "The job was tailored and moved to the ready column.",
      });
      await onImported(created.id);
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import job";
      toast.error(message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-4">
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
                      void handleFetch();
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
                      await handleFetch();
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
              onClick={
                fetchUrl.trim()
                  ? () => void handleFetch()
                  : () => void handleAnalyze()
              }
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
              <FieldInput
                id="draft-title"
                label="Title *"
                value={draft.title}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, title: value }))
                }
                placeholder="e.g. Junior Backend Engineer"
              />
              <FieldInput
                id="draft-employer"
                label="Employer *"
                value={draft.employer}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, employer: value }))
                }
                placeholder="e.g. Acme Labs"
              />
              <FieldInput
                id="draft-location"
                label="Location"
                value={draft.location}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, location: value }))
                }
                placeholder="e.g. London, UK"
              />
              <FieldInput
                id="draft-salary"
                label="Salary"
                value={draft.salary}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, salary: value }))
                }
                placeholder="e.g. GBP 45k-55k"
              />
              <FieldInput
                id="draft-deadline"
                label="Deadline"
                value={draft.deadline}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, deadline: value }))
                }
                placeholder="e.g. 30 Sep 2025"
              />
              <FieldInput
                id="draft-jobType"
                label="Job type"
                value={draft.jobType}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, jobType: value }))
                }
                placeholder="e.g. Full-time"
              />
              <FieldInput
                id="draft-jobLevel"
                label="Job level"
                value={draft.jobLevel}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, jobLevel: value }))
                }
                placeholder="e.g. Graduate"
              />
              <FieldInput
                id="draft-jobFunction"
                label="Job function"
                value={draft.jobFunction}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, jobFunction: value }))
                }
                placeholder="e.g. Software Engineering"
              />
              <FieldInput
                id="draft-disciplines"
                label="Disciplines"
                value={draft.disciplines}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, disciplines: value }))
                }
                placeholder="e.g. Computer Science"
              />
              <FieldInput
                id="draft-degreeRequired"
                label="Degree required"
                value={draft.degreeRequired}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, degreeRequired: value }))
                }
                placeholder="e.g. BSc or MSc"
              />
              <FieldInput
                id="draft-starting"
                label="Starting"
                value={draft.starting}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, starting: value }))
                }
                placeholder="e.g. September 2026"
              />
              <FieldInput
                id="draft-jobUrl"
                label="Job URL"
                value={draft.jobUrl}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, jobUrl: value }))
                }
                placeholder="https://..."
              />
              <FieldInput
                id="draft-applicationLink"
                label="Application URL"
                value={draft.applicationLink}
                onChange={(value) =>
                  setDraft((prev) => ({ ...prev, applicationLink: value }))
                }
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1">
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
                placeholder="Paste the job description..."
                className="min-h-[180px] font-mono text-sm leading-relaxed"
              />
            </div>

            <Button
              onClick={() => void handleImport()}
              disabled={!canImport || isImporting}
              className="w-full h-10 gap-2"
            >
              {isImporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isImporting ? "Importing..." : "Import job"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

const FieldInput: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}> = ({ id, label, value, onChange, placeholder }) => (
  <div className="space-y-1">
    <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
      {label}
    </label>
    <Input
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    />
  </div>
);
