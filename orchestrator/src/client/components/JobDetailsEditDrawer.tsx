import type { Job } from "@shared/types.js";
import { Loader2, Save } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import * as api from "../api";

interface JobDetailsEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  onJobUpdated: () => void | Promise<void>;
}

type JobDetailsDraft = {
  title: string;
  employer: string;
  jobUrl: string;
  applicationLink: string;
  location: string;
  salary: string;
  deadline: string;
  jobDescription: string;
};

const emptyDraft: JobDetailsDraft = {
  title: "",
  employer: "",
  jobUrl: "",
  applicationLink: "",
  location: "",
  salary: "",
  deadline: "",
  jobDescription: "",
};

const normalizeOptional = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeFromJob = (job: Job | null): JobDetailsDraft => {
  if (!job) return emptyDraft;
  return {
    title: job.title ?? "",
    employer: job.employer ?? "",
    jobUrl: job.jobUrl ?? "",
    applicationLink: job.applicationLink ?? "",
    location: job.location ?? "",
    salary: job.salary ?? "",
    deadline: job.deadline ?? "",
    jobDescription: job.jobDescription ?? "",
  };
};

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

export const JobDetailsEditDrawer: React.FC<JobDetailsEditDrawerProps> = ({
  open,
  onOpenChange,
  job,
  onJobUpdated,
}) => {
  const [draft, setDraft] = useState<JobDetailsDraft>(emptyDraft);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(normalizeFromJob(job));
    setValidationError(null);
    setIsSaving(false);
  }, [job, open]);

  const hasJob = !!job;
  const isDirty = useMemo(() => {
    if (!job) return false;
    const current = normalizeFromJob(job);
    return (
      draft.title !== current.title ||
      draft.employer !== current.employer ||
      draft.jobUrl !== current.jobUrl ||
      draft.applicationLink !== current.applicationLink ||
      draft.location !== current.location ||
      draft.salary !== current.salary ||
      draft.deadline !== current.deadline ||
      draft.jobDescription !== current.jobDescription
    );
  }, [draft, job]);

  const handleSave = async () => {
    if (!job) return;

    const title = draft.title.trim();
    const employer = draft.employer.trim();
    const jobUrl = draft.jobUrl.trim();
    const applicationLink = draft.applicationLink.trim();

    if (!title) {
      setValidationError("Title is required.");
      return;
    }
    if (!employer) {
      setValidationError("Employer is required.");
      return;
    }
    if (!jobUrl) {
      setValidationError("Job URL is required.");
      return;
    }
    if (!isValidUrl(jobUrl)) {
      setValidationError("Job URL must be a valid URL.");
      return;
    }
    if (applicationLink && !isValidUrl(applicationLink)) {
      setValidationError("Application URL must be a valid URL.");
      return;
    }

    try {
      setValidationError(null);
      setIsSaving(true);

      const employerChanged =
        employer.toLowerCase() !== job.employer.trim().toLowerCase();

      await api.updateJob(job.id, {
        title,
        employer,
        jobUrl,
        applicationLink: normalizeOptional(draft.applicationLink),
        location: normalizeOptional(draft.location),
        salary: normalizeOptional(draft.salary),
        deadline: normalizeOptional(draft.deadline),
        jobDescription: normalizeOptional(draft.jobDescription),
      });

      if (employerChanged) {
        try {
          await api.checkSponsor(job.id);
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Job updated, but sponsor check failed";
          toast.error(message);
        }
      }

      await onJobUpdated();

      toast.success("Job details updated", {
        action: {
          label: "Rescore now",
          onClick: () => {
            void (async () => {
              try {
                await api.rescoreJob(job.id);
                await onJobUpdated();
                toast.success("Match recalculated");
              } catch (error) {
                const message =
                  error instanceof Error
                    ? error.message
                    : "Failed to recalculate match";
                toast.error(message);
              }
            })();
          },
        },
      });

      onOpenChange(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update job details";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <div className="flex h-full flex-col">
          <SheetHeader>
            <SheetTitle>Edit job details</SheetTitle>
            <SheetDescription>
              Correct extracted metadata before continuing with this role.
            </SheetDescription>
          </SheetHeader>

          {!hasJob ? (
            <div className="mt-6 rounded-lg border border-dashed border-border/60 p-4 text-sm text-muted-foreground">
              Select a job to edit.
            </div>
          ) : (
            <>
              <div className="mt-4 flex-1 overflow-y-auto pr-1">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FieldInput
                    id="edit-job-title"
                    label="Title *"
                    value={draft.title}
                    onChange={(value) =>
                      setDraft((prev) => ({ ...prev, title: value }))
                    }
                    placeholder="e.g. Full Stack Engineer"
                  />
                  <FieldInput
                    id="edit-job-employer"
                    label="Employer *"
                    value={draft.employer}
                    onChange={(value) =>
                      setDraft((prev) => ({ ...prev, employer: value }))
                    }
                    placeholder="e.g. Acme Labs"
                  />
                  <FieldInput
                    id="edit-job-url"
                    label="Job URL *"
                    value={draft.jobUrl}
                    onChange={(value) =>
                      setDraft((prev) => ({ ...prev, jobUrl: value }))
                    }
                    placeholder="https://..."
                  />
                  <FieldInput
                    id="edit-application-url"
                    label="Application URL"
                    value={draft.applicationLink}
                    onChange={(value) =>
                      setDraft((prev) => ({ ...prev, applicationLink: value }))
                    }
                    placeholder="https://..."
                  />
                  <FieldInput
                    id="edit-location"
                    label="Location"
                    value={draft.location}
                    onChange={(value) =>
                      setDraft((prev) => ({ ...prev, location: value }))
                    }
                    placeholder="e.g. London, UK"
                  />
                  <FieldInput
                    id="edit-salary"
                    label="Salary"
                    value={draft.salary}
                    onChange={(value) =>
                      setDraft((prev) => ({ ...prev, salary: value }))
                    }
                    placeholder="e.g. GBP 90k-110k"
                  />
                  <FieldInput
                    id="edit-deadline"
                    label="Deadline"
                    value={draft.deadline}
                    onChange={(value) =>
                      setDraft((prev) => ({ ...prev, deadline: value }))
                    }
                    placeholder="e.g. 31 Mar 2026"
                  />
                </div>

                <div className="mt-3 space-y-1">
                  <label
                    htmlFor="edit-job-description"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Job description
                  </label>
                  <Textarea
                    id="edit-job-description"
                    value={draft.jobDescription}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        jobDescription: event.target.value,
                      }))
                    }
                    placeholder="Paste or refine the job description..."
                    className="min-h-[220px] font-mono text-sm leading-relaxed"
                  />
                </div>

                {validationError && (
                  <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    {validationError}
                  </div>
                )}
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving || !isDirty}
                >
                  {isSaving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save details
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
