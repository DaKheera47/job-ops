/**
 * Manual job import flow (paste JD -> infer -> review -> import).
 */

import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileText, Loader2, Sparkles } from "lucide-react";
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
import * as api from "../api";
import type { ManualJobDraft } from "../../shared/types";

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

const normalizeDraft = (draft?: ManualJobDraft | null, jd?: string): ManualJobDraftState => ({
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
  const [draft, setDraft] = useState<ManualJobDraftState>(emptyDraft);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep("paste");
      setRawDescription("");
      setDraft(emptyDraft);
      setWarning(null);
      setError(null);
      setIsImporting(false);
    }
  }, [open]);

  const stepIndex = step === "paste" ? 0 : step === "loading" ? 1 : 2;
  const stepLabel = ["Paste JD", "Infer details", "Review & import"][stepIndex];

  const canAnalyze = rawDescription.trim().length > 0 && step !== "loading";
  const canImport = useMemo(() => {
    if (step !== "review") return false;
    return (
      draft.title.trim().length > 0 &&
      draft.employer.trim().length > 0 &&
      draft.jobDescription.trim().length > 0
    );
  }, [draft, step]);

  const handleAnalyze = async () => {
    if (!rawDescription.trim()) {
      setError("Paste a job description to continue.");
      return;
    }

    try {
      setError(null);
      setWarning(null);
      setStep("loading");
      const response = await api.inferManualJob({ jobDescription: rawDescription });
      setDraft(normalizeDraft(response.job, rawDescription.trim()));
      setWarning(response.warning ?? null);
      setStep("review");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to analyze job description";
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
      const message = err instanceof Error ? err.message : "Failed to import job";
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
              Paste a job description, review the AI draft, then import the role.
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
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Job description
                  </label>
                  <Textarea
                    value={rawDescription}
                    onChange={(event) => setRawDescription(event.target.value)}
                    placeholder="Paste the full job description here..."
                    className="min-h-[220px] font-mono text-sm leading-relaxed"
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {error}
                  </div>
                )}

                <Button
                  onClick={handleAnalyze}
                  disabled={!canAnalyze}
                  className="w-full h-10 gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Analyze JD
                </Button>
              </div>
            )}

            {step === "loading" && (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <div className="text-sm font-semibold">Analyzing job description</div>
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
                    <label className="text-xs font-medium text-muted-foreground">Title *</label>
                    <Input
                      value={draft.title}
                      onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
                      placeholder="e.g. Junior Backend Engineer"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Employer *</label>
                    <Input
                      value={draft.employer}
                      onChange={(event) => setDraft((prev) => ({ ...prev, employer: event.target.value }))}
                      placeholder="e.g. Acme Labs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Location</label>
                    <Input
                      value={draft.location}
                      onChange={(event) => setDraft((prev) => ({ ...prev, location: event.target.value }))}
                      placeholder="e.g. London, UK"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Salary</label>
                    <Input
                      value={draft.salary}
                      onChange={(event) => setDraft((prev) => ({ ...prev, salary: event.target.value }))}
                      placeholder="e.g. GBP 45k-55k"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Deadline</label>
                    <Input
                      value={draft.deadline}
                      onChange={(event) => setDraft((prev) => ({ ...prev, deadline: event.target.value }))}
                      placeholder="e.g. 30 Sep 2025"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Job type</label>
                    <Input
                      value={draft.jobType}
                      onChange={(event) => setDraft((prev) => ({ ...prev, jobType: event.target.value }))}
                      placeholder="e.g. Full-time"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Job level</label>
                    <Input
                      value={draft.jobLevel}
                      onChange={(event) => setDraft((prev) => ({ ...prev, jobLevel: event.target.value }))}
                      placeholder="e.g. Graduate"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Job function</label>
                    <Input
                      value={draft.jobFunction}
                      onChange={(event) => setDraft((prev) => ({ ...prev, jobFunction: event.target.value }))}
                      placeholder="e.g. Software Engineering"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Disciplines</label>
                    <Input
                      value={draft.disciplines}
                      onChange={(event) => setDraft((prev) => ({ ...prev, disciplines: event.target.value }))}
                      placeholder="e.g. Computer Science"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Degree required</label>
                    <Input
                      value={draft.degreeRequired}
                      onChange={(event) => setDraft((prev) => ({ ...prev, degreeRequired: event.target.value }))}
                      placeholder="e.g. BSc or MSc"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Starting</label>
                    <Input
                      value={draft.starting}
                      onChange={(event) => setDraft((prev) => ({ ...prev, starting: event.target.value }))}
                      placeholder="e.g. Summer 2026"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Job URL</label>
                    <Input
                      value={draft.jobUrl}
                      onChange={(event) => setDraft((prev) => ({ ...prev, jobUrl: event.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">Application link</label>
                    <Input
                      value={draft.applicationLink}
                      onChange={(event) => setDraft((prev) => ({ ...prev, applicationLink: event.target.value }))}
                      placeholder="https://..."
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Job description *
                  </label>
                  <Textarea
                    value={draft.jobDescription}
                    onChange={(event) => setDraft((prev) => ({ ...prev, jobDescription: event.target.value }))}
                    className="min-h-[200px] font-mono text-sm leading-relaxed"
                    placeholder="Paste the job description..."
                  />
                </div>

                <div className="space-y-3 pt-2">
                  <Separator />
                  <Button
                    onClick={handleImport}
                    disabled={!canImport || isImporting}
                    className={cn("w-full h-10 gap-2", !canImport && "opacity-70")}
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
