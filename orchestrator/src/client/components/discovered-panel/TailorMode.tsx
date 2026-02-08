import type { Job, ResumeProjectCatalogItem } from "@shared/types.js";
import {
  ArrowLeft,
  Check,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import * as api from "../../api";
import {
  createTailoredSkillDraftId,
  type EditableSkillGroup,
  fromEditableSkillGroups,
  parseTailoredSkills,
  serializeTailoredSkills,
  toEditableSkillGroups,
} from "../tailoring-utils";
import { CollapsibleSection } from "./CollapsibleSection";
import { ProjectSelector } from "./ProjectSelector";

interface TailorModeProps {
  job: Job;
  onBack: () => void;
  onFinalize: () => void;
  isFinalizing: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
  /** Variant controls the finalize button text. Default is 'discovered'. */
  variant?: "discovered" | "ready";
}

const parseSelectedIds = (value: string | null | undefined) =>
  new Set(value?.split(",").filter(Boolean) ?? []);

const hasSelectionDiff = (current: Set<string>, saved: Set<string>) => {
  if (current.size !== saved.size) return true;
  for (const id of current) {
    if (!saved.has(id)) return true;
  }
  return false;
};

export const TailorMode: React.FC<TailorModeProps> = ({
  job,
  onBack,
  onFinalize,
  isFinalizing,
  onDirtyChange,
  variant = "discovered",
}) => {
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [summary, setSummary] = useState(job.tailoredSummary || "");
  const [headline, setHeadline] = useState(job.tailoredHeadline || "");
  const [jobDescription, setJobDescription] = useState(
    job.jobDescription || "",
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() =>
    parseSelectedIds(job.selectedProjectIds),
  );
  const [skillsDraft, setSkillsDraft] = useState<EditableSkillGroup[]>(() =>
    toEditableSkillGroups(parseTailoredSkills(job.tailoredSkills)),
  );

  const [savedSummary, setSavedSummary] = useState(job.tailoredSummary || "");
  const [savedHeadline, setSavedHeadline] = useState(
    job.tailoredHeadline || "",
  );
  const [savedDescription, setSavedDescription] = useState(
    job.jobDescription || "",
  );
  const [savedSelectedIds, setSavedSelectedIds] = useState<Set<string>>(() =>
    parseSelectedIds(job.selectedProjectIds),
  );
  const [savedSkillsJson, setSavedSkillsJson] = useState(() =>
    serializeTailoredSkills(parseTailoredSkills(job.tailoredSkills)),
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftStatus, setDraftStatus] = useState<
    "unsaved" | "saving" | "saved"
  >("saved");
  const [showDescription, setShowDescription] = useState(false);
  const [activeField, setActiveField] = useState<
    "summary" | "headline" | "description" | "skills" | null
  >(null);
  const lastJobIdRef = useRef(job.id);

  useEffect(() => {
    api.getResumeProjectsCatalog().then(setCatalog).catch(console.error);
  }, []);

  const skillsJson = useMemo(
    () => serializeTailoredSkills(fromEditableSkillGroups(skillsDraft)),
    [skillsDraft],
  );

  const isDirty = useMemo(() => {
    if (summary !== savedSummary) return true;
    if (headline !== savedHeadline) return true;
    if (jobDescription !== savedDescription) return true;
    if (skillsJson !== savedSkillsJson) return true;
    return hasSelectionDiff(selectedIds, savedSelectedIds);
  }, [
    summary,
    savedSummary,
    headline,
    savedHeadline,
    jobDescription,
    savedDescription,
    skillsJson,
    savedSkillsJson,
    selectedIds,
    savedSelectedIds,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  useEffect(() => {
    const incomingSummary = job.tailoredSummary || "";
    const incomingHeadline = job.tailoredHeadline || "";
    const incomingDescription = job.jobDescription || "";
    const incomingSelectedIds = parseSelectedIds(job.selectedProjectIds);
    const incomingSkills = toEditableSkillGroups(
      parseTailoredSkills(job.tailoredSkills),
    );
    const incomingSkillsJson = serializeTailoredSkills(
      fromEditableSkillGroups(incomingSkills),
    );

    if (job.id !== lastJobIdRef.current) {
      lastJobIdRef.current = job.id;
      setSummary(incomingSummary);
      setHeadline(incomingHeadline);
      setJobDescription(incomingDescription);
      setSelectedIds(incomingSelectedIds);
      setSkillsDraft(incomingSkills);
      setSavedSummary(incomingSummary);
      setSavedHeadline(incomingHeadline);
      setSavedDescription(incomingDescription);
      setSavedSelectedIds(incomingSelectedIds);
      setSavedSkillsJson(incomingSkillsJson);
      setDraftStatus("saved");
      return;
    }

    if (isDirty || activeField !== null) return;

    setSummary(incomingSummary);
    setHeadline(incomingHeadline);
    setJobDescription(incomingDescription);
    setSelectedIds(incomingSelectedIds);
    setSkillsDraft(incomingSkills);
    setSavedSummary(incomingSummary);
    setSavedHeadline(incomingHeadline);
    setSavedDescription(incomingDescription);
    setSavedSelectedIds(incomingSelectedIds);
    setSavedSkillsJson(incomingSkillsJson);
    setDraftStatus("saved");
  }, [
    job.id,
    job.tailoredSummary,
    job.tailoredHeadline,
    job.tailoredSkills,
    job.jobDescription,
    job.selectedProjectIds,
    isDirty,
    activeField,
  ]);

  useEffect(() => {
    if (isDirty && draftStatus === "saved") {
      setDraftStatus("unsaved");
    }
    if (!isDirty && draftStatus === "unsaved") {
      setDraftStatus("saved");
    }
  }, [isDirty, draftStatus]);

  const selectedIdsCsv = useMemo(
    () => Array.from(selectedIds).join(","),
    [selectedIds],
  );

  const syncSavedSnapshot = useCallback(
    (
      nextSummary: string,
      nextHeadline: string,
      nextDescription: string,
      nextSelectedIds: Set<string>,
      nextSkillsDraft: EditableSkillGroup[],
    ) => {
      setSavedSummary(nextSummary);
      setSavedHeadline(nextHeadline);
      setSavedDescription(nextDescription);
      setSavedSelectedIds(new Set(nextSelectedIds));
      setSavedSkillsJson(
        serializeTailoredSkills(fromEditableSkillGroups(nextSkillsDraft)),
      );
      setDraftStatus("saved");
    },
    [],
  );

  const persistCurrent = useCallback(async () => {
    await api.updateJob(job.id, {
      tailoredSummary: summary,
      tailoredHeadline: headline,
      tailoredSkills: skillsJson,
      jobDescription,
      selectedProjectIds: selectedIdsCsv,
    });
    syncSavedSnapshot(
      summary,
      headline,
      jobDescription,
      selectedIds,
      skillsDraft,
    );
  }, [
    job.id,
    summary,
    headline,
    skillsJson,
    jobDescription,
    selectedIdsCsv,
    selectedIds,
    skillsDraft,
    syncSavedSnapshot,
  ]);

  useEffect(() => {
    if (!isDirty || draftStatus !== "unsaved") return;

    const timeout = setTimeout(async () => {
      try {
        setDraftStatus("saving");
        await persistCurrent();
      } catch {
        setDraftStatus("unsaved");
      }
    }, 1500);

    return () => clearTimeout(timeout);
  }, [isDirty, draftStatus, persistCurrent]);

  const handleToggleProject = useCallback(
    (id: string) => {
      if (isGenerating || isFinalizing) return;
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [isGenerating, isFinalizing],
  );

  const handleAddSkillGroup = useCallback(() => {
    if (isGenerating || isFinalizing || isSaving) return;
    setSkillsDraft((prev) => [
      ...prev,
      { id: createTailoredSkillDraftId(), name: "", keywordsText: "" },
    ]);
  }, [isGenerating, isFinalizing, isSaving]);

  const handleUpdateSkillGroup = useCallback(
    (id: string, key: "name" | "keywordsText", value: string) => {
      setSkillsDraft((prev) =>
        prev.map((group) =>
          group.id === id ? { ...group, [key]: value } : group,
        ),
      );
    },
    [],
  );

  const handleRemoveSkillGroup = useCallback((id: string) => {
    setSkillsDraft((prev) => prev.filter((group) => group.id !== id));
  }, []);

  const handleGenerateWithAI = async () => {
    try {
      setIsGenerating(true);

      if (isDirty) {
        await persistCurrent();
      }

      const updatedJob = await api.summarizeJob(job.id, { force: true });
      const nextSummary = updatedJob.tailoredSummary || "";
      const nextHeadline = updatedJob.tailoredHeadline || "";
      const nextDescription = updatedJob.jobDescription || "";
      const nextSelectedIds = parseSelectedIds(updatedJob.selectedProjectIds);
      const nextSkillsDraft = toEditableSkillGroups(
        parseTailoredSkills(updatedJob.tailoredSkills),
      );
      setSummary(nextSummary);
      setHeadline(nextHeadline);
      setJobDescription(nextDescription);
      setSelectedIds(nextSelectedIds);
      setSkillsDraft(nextSkillsDraft);
      syncSavedSnapshot(
        nextSummary,
        nextHeadline,
        nextDescription,
        nextSelectedIds,
        nextSkillsDraft,
      );
      toast.success("Draft generated with AI", {
        description: "Review and edit before finalizing.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to generate AI draft";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFinalize = async () => {
    if (isDirty) {
      try {
        setIsSaving(true);
        await persistCurrent();
      } catch {
        toast.error("Failed to save draft before finalizing");
        setIsSaving(false);
        return;
      } finally {
        setIsSaving(false);
      }
    }

    onFinalize();
  };

  const maxProjects = 3;
  const canFinalize = summary.trim().length > 0 && selectedIds.size > 0;
  const disableInputs = isGenerating || isFinalizing || isSaving;

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to overview
        </button>

        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {draftStatus === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              Saving...
            </>
          )}
          {draftStatus === "saved" && !isDirty && (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              Saved
            </>
          )}
          {draftStatus === "unsaved" && (
            <span className="text-amber-400">Unsaved changes</span>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-medium text-amber-300">
            Draft tailoring for this role
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 ml-4">
          Edit below, then finalize to generate your PDF and move to Ready.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        <div className="flex flex-col gap-2 rounded-lg border border-border/40 bg-muted/10 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-medium">
              Need help getting started?
            </div>
            <div className="text-[10px] text-muted-foreground">
              AI can draft summary, headline, skills, and project selection
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateWithAI}
            disabled={isGenerating || isFinalizing}
            className="h-8 w-full text-xs sm:w-auto"
          >
            {isGenerating ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            )}
            Generate draft
          </Button>
        </div>

        <CollapsibleSection
          isOpen={showDescription}
          onToggle={() => setShowDescription((prev) => !prev)}
          label={`${showDescription ? "Hide" : "Edit"} job description`}
        >
          <div className="space-y-1">
            <label
              htmlFor="tailor-jd-edit"
              className="text-[10px] font-medium text-muted-foreground/70"
            >
              Edit to help AI tailoring
            </label>
            <textarea
              id="tailor-jd-edit"
              className="w-full min-h-[120px] max-h-[250px] rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={jobDescription}
              onChange={(event) => setJobDescription(event.target.value)}
              onFocus={() => setActiveField("description")}
              onBlur={() =>
                setActiveField((prev) => (prev === "description" ? null : prev))
              }
              placeholder="The raw job description..."
              disabled={disableInputs}
            />
          </div>
        </CollapsibleSection>

        <div className="space-y-2">
          <label
            htmlFor="tailor-summary-edit"
            className="text-xs font-medium text-muted-foreground"
          >
            Tailored Summary
          </label>
          <textarea
            id="tailor-summary-edit"
            className="w-full min-h-[100px] rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            onFocus={() => setActiveField("summary")}
            onBlur={() =>
              setActiveField((prev) => (prev === "summary" ? null : prev))
            }
            placeholder="Write a tailored summary for this role, or generate with AI..."
            disabled={disableInputs}
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="tailor-headline-edit"
            className="text-xs font-medium text-muted-foreground"
          >
            Tailored Headline
          </label>
          <input
            id="tailor-headline-edit"
            type="text"
            className="w-full rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={headline}
            onChange={(event) => setHeadline(event.target.value)}
            onFocus={() => setActiveField("headline")}
            onBlur={() =>
              setActiveField((prev) => (prev === "headline" ? null : prev))
            }
            placeholder="Write a concise headline tailored to this role..."
            disabled={disableInputs}
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Tailored Skills
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={handleAddSkillGroup}
              disabled={disableInputs}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add Skill Group
            </Button>
          </div>

          {skillsDraft.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-[11px] text-center text-muted-foreground">
              No skill groups yet. Add one to tailor keywords for this role.
            </div>
          ) : (
            <div className="space-y-2">
              {skillsDraft.map((group) => (
                <div
                  key={group.id}
                  className="space-y-2 rounded-lg border border-border/60 bg-background/30 p-3"
                >
                  <div className="space-y-1">
                    <label
                      htmlFor={`tailor-skill-group-name-${group.id}`}
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Category
                    </label>
                    <input
                      id={`tailor-skill-group-name-${group.id}`}
                      type="text"
                      className="w-full rounded-md border border-border/60 bg-background/50 px-2.5 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={group.name}
                      onChange={(event) =>
                        handleUpdateSkillGroup(
                          group.id,
                          "name",
                          event.target.value,
                        )
                      }
                      onFocus={() => setActiveField("skills")}
                      onBlur={() =>
                        setActiveField((prev) =>
                          prev === "skills" ? null : prev,
                        )
                      }
                      placeholder="Backend, Frontend, Infrastructure..."
                      disabled={disableInputs}
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={`tailor-skill-group-keywords-${group.id}`}
                      className="text-[11px] font-medium text-muted-foreground"
                    >
                      Keywords (comma-separated)
                    </label>
                    <input
                      id={`tailor-skill-group-keywords-${group.id}`}
                      type="text"
                      className="w-full rounded-md border border-border/60 bg-background/50 px-2.5 py-2 text-sm ring-offset-background placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      value={group.keywordsText}
                      onChange={(event) =>
                        handleUpdateSkillGroup(
                          group.id,
                          "keywordsText",
                          event.target.value,
                        )
                      }
                      onFocus={() => setActiveField("skills")}
                      onBlur={() =>
                        setActiveField((prev) =>
                          prev === "skills" ? null : prev,
                        )
                      }
                      placeholder="TypeScript, Node.js, REST APIs..."
                      disabled={disableInputs}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveSkillGroup(group.id)}
                      disabled={disableInputs}
                      className="h-7 px-2 text-[11px]"
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <ProjectSelector
          catalog={catalog}
          selectedIds={selectedIds}
          onToggle={handleToggleProject}
          maxProjects={maxProjects}
          disabled={disableInputs}
        />
      </div>

      <Separator className="opacity-50 my-4" />

      <div className="space-y-2">
        {!canFinalize && (
          <p className="text-[10px] text-center text-muted-foreground">
            Add a summary and select at least one project to{" "}
            {variant === "ready" ? "regenerate" : "finalize"}.
          </p>
        )}
        <Button
          onClick={handleFinalize}
          disabled={isFinalizing || !canFinalize || isGenerating}
          className="w-full h-10 bg-emerald-600 hover:bg-emerald-500 text-white"
        >
          {isFinalizing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {variant === "ready"
                ? "Regenerating PDF..."
                : "Finalizing & generating PDF..."}
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              {variant === "ready"
                ? "Regenerate PDF"
                : "Finalize & Move to Ready"}
            </>
          )}
        </Button>
        <p className="text-[10px] text-center text-muted-foreground/70">
          {variant === "ready"
            ? "This will save your changes and regenerate the tailored PDF."
            : "This will generate your tailored PDF and move the job to Ready."}
        </p>
      </div>
    </div>
  );
};
