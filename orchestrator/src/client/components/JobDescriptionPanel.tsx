import { useSettings } from "@client/hooks/useSettings";
import { getRenderableJobDescription } from "@client/lib/jobDescription";
import {
  Copy,
  Edit2,
  ExternalLink,
  FileText,
  Loader2,
  Save,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, copyTextToClipboard } from "@/lib/utils";
import { showErrorToast } from "../lib/error-toast";
import { JobDescriptionMarkdown } from "./JobDescriptionMarkdown";

type JobDescriptionPanelProps = {
  className?: string;
  description: string | null | undefined;
  helperText?: string;
  jobUrl?: string | null;
  maxHeightClassName?: string;
  onSave?: (description: string) => Promise<void> | void;
};

const defaultHelperText =
  "Base description extracted from the job listing, editable if something looks off. Used by the Ghostwriter and for fit assessment.";

export const JobDescriptionPanel: React.FC<JobDescriptionPanelProps> = ({
  className,
  description: rawDescription,
  helperText = defaultHelperText,
  jobUrl,
  maxHeightClassName = "max-h-[420px]",
  onSave,
}) => {
  const { renderMarkdownInJobDescriptions } = useSettings();
  const [isEditing, setIsEditing] = useState(false);
  const [editedDescription, setEditedDescription] = useState(
    rawDescription ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const description = useMemo(
    () => getRenderableJobDescription(rawDescription),
    [rawDescription],
  );
  const canEdit = Boolean(onSave);

  useEffect(() => {
    if (isEditing) return;
    setEditedDescription(rawDescription ?? "");
  }, [isEditing, rawDescription]);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(rawDescription || description);
      toast.success("Copied job description");
    } catch (error) {
      showErrorToast(error, "Failed to copy job description");
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedDescription(rawDescription ?? "");
  };

  const handleSave = async () => {
    if (!onSave) return;

    try {
      setIsSaving(true);
      await onSave(editedDescription);
      toast.success("Job description updated");
      setIsEditing(false);
    } catch (error) {
      showErrorToast(error, "Failed to update description");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Accordion
      type="single"
      collapsible
      defaultValue="job-description"
      className={cn(
        "overflow-hidden rounded-lg border border-border/45 bg-muted/25",
        className,
      )}
    >
      <AccordionItem value="job-description" className="border-b-0">
        <div className="relative">
          <AccordionTrigger className="flex items-center justify-between gap-2 border-b border-border/35 bg-muted/5 cursor-pointer hover:bg-muted/40 px-3 py-2.5 pr-4 text-left hover:no-underline">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
                <FileText className="h-3.5 w-3.5 text-sky-400/80" />
                Job description
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground/65 max-w-3/5">
                {helperText}
              </p>
            </div>
          </AccordionTrigger>
          <div className="flex flex-wrap justify-end gap-1 border-b border-border/35 bg-muted/5 px-3 pb-2 sm:absolute sm:right-8 sm:top-1/2 sm:border-b-0 sm:bg-transparent sm:p-0 sm:-translate-y-1/2">
            {!isEditing ? (
              <>
                {jobUrl ? (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={jobUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      View job
                    </a>
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleCopy()}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy
                </Button>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                    Edit
                  </Button>
                ) : null}
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Save
                </Button>
              </>
            )}
          </div>
        </div>

        <AccordionContent className="p-0">
          <div
            className={cn(
              "overflow-y-auto bg-background/20 p-4 text-sm text-foreground/75",
              maxHeightClassName,
            )}
          >
            {isEditing ? (
              <Textarea
                value={editedDescription}
                onChange={(event) => setEditedDescription(event.target.value)}
                className="min-h-[360px] bg-background/70 font-mono text-sm leading-relaxed focus-visible:ring-1"
                placeholder="Enter job description..."
              />
            ) : renderMarkdownInJobDescriptions ? (
              <JobDescriptionMarkdown description={description} />
            ) : (
              <div className="whitespace-pre-wrap leading-7">{description}</div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
