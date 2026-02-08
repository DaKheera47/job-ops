import type { Job, ResumeProjectCatalogItem } from "@shared/types.js";
import {
  AlertTriangle,
  Check,
  FileText,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import * as api from "../api";
import {
  createTailoredSkillDraftId,
  type EditableSkillGroup,
  fromEditableSkillGroups,
  parseTailoredSkills,
  serializeTailoredSkills,
  toEditableSkillGroups,
} from "./tailoring-utils";

interface TailoringEditorProps {
  job: Job;
  onUpdate: () => void | Promise<void>;
  onDirtyChange?: (isDirty: boolean) => void;
  onRegisterSave?: (save: () => Promise<void>) => void;
  onBeforeGenerate?: () => boolean | Promise<boolean>;
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

export const TailoringEditor: React.FC<TailoringEditorProps> = ({
  job,
  onUpdate,
  onDirtyChange,
  onRegisterSave,
  onBeforeGenerate,
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
  const [openSkillGroupId, setOpenSkillGroupId] = useState<string>("");
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
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeField, setActiveField] = useState<
    "summary" | "headline" | "description" | "skills" | null
  >(null);
  const lastJobIdRef = useRef(job.id);

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
    api.getResumeProjectsCatalog().then(setCatalog).catch(console.error);
  }, []);

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
    },
    [],
  );

  const selectedIdsCsv = useMemo(
    () => Array.from(selectedIds).join(","),
    [selectedIds],
  );

  const saveChanges = useCallback(
    async ({ showToast = true }: { showToast?: boolean } = {}) => {
      try {
        setIsSaving(true);
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
        if (showToast) toast.success("Changes saved");
        await onUpdate();
      } catch (error) {
        if (showToast) toast.error("Failed to save changes");
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [
      job.id,
      onUpdate,
      selectedIdsCsv,
      selectedIds,
      summary,
      headline,
      skillsJson,
      skillsDraft,
      jobDescription,
      syncSavedSnapshot,
    ],
  );

  useEffect(() => {
    onRegisterSave?.(() => saveChanges({ showToast: false }));
  }, [onRegisterSave, saveChanges]);

  const handleToggleProject = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleAddSkillGroup = () => {
    const nextId = createTailoredSkillDraftId();
    setSkillsDraft((prev) => [
      ...prev,
      { id: nextId, name: "", keywordsText: "" },
    ]);
    setOpenSkillGroupId(nextId);
  };

  const handleUpdateSkillGroup = (
    id: string,
    key: "name" | "keywordsText",
    value: string,
  ) => {
    setSkillsDraft((prev) =>
      prev.map((group) =>
        group.id === id ? { ...group, [key]: value } : group,
      ),
    );
  };

  const handleRemoveSkillGroup = (id: string) => {
    setSkillsDraft((prev) => prev.filter((group) => group.id !== id));
  };

  useEffect(() => {
    if (
      openSkillGroupId.length > 0 &&
      !skillsDraft.some((group) => group.id === openSkillGroupId)
    ) {
      setOpenSkillGroupId("");
    }
  }, [skillsDraft, openSkillGroupId]);

  const handleSave = async () => {
    try {
      await saveChanges();
    } catch {
      // Toast handled in saveChanges
    }
  };

  const handleSummarize = async () => {
    try {
      setIsSummarizing(true);
      if (isDirty) {
        await saveChanges({ showToast: false });
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
      toast.success("AI Summary & Projects generated");
      await onUpdate();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "AI summarization failed";
      toast.error(message);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleGeneratePdf = async () => {
    try {
      const shouldProceed = onBeforeGenerate ? await onBeforeGenerate() : true;
      if (shouldProceed === false) return;

      setIsGeneratingPdf(true);
      await saveChanges({ showToast: false });

      await api.generateJobPdf(job.id);
      toast.success("Resume PDF generated");
      await onUpdate();
    } catch (_error) {
      toast.error("PDF generation failed");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const maxProjects = 3;
  const tooManyProjects = selectedIds.size > maxProjects;
  const disableInputs = isSummarizing || isGeneratingPdf || isSaving;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">Editor</h3>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            size="sm"
            variant="outline"
            onClick={handleSummarize}
            disabled={isSummarizing || isGeneratingPdf || isSaving}
            className="w-full sm:w-auto"
          >
            {isSummarizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            AI Summarize
          </Button>
          <Button
            size="sm"
            onClick={handleGeneratePdf}
            disabled={isSummarizing || isGeneratingPdf || isSaving || !summary}
            className="w-full sm:w-auto"
          >
            {isGeneratingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            Generate PDF
          </Button>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
        <div className="space-y-2">
          <label htmlFor="tailor-jd" className="text-sm font-medium">
            Job Description (Edit to help AI tailoring)
          </label>
          <textarea
            id="tailor-jd"
            className="w-full min-h-[120px] max-h-[250px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            onFocus={() => setActiveField("description")}
            onBlur={() =>
              setActiveField((prev) => (prev === "description" ? null : prev))
            }
            placeholder="The raw job description..."
          />
        </div>

        <Separator />

        <Accordion
          type="multiple"
          className="space-y-3"
        >
          <AccordionItem
            value="summary"
            className="rounded-lg border border-input/80 bg-muted/20 px-0"
          >
            <AccordionTrigger className="px-3 py-2 text-sm font-medium hover:no-underline">
              Summary
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-1">
              <label
                htmlFor="tailor-summary"
                className="sr-only text-sm font-medium"
              >
                Tailored Summary
              </label>
              <textarea
                id="tailor-summary"
                className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                onFocus={() => setActiveField("summary")}
                onBlur={() =>
                  setActiveField((prev) => (prev === "summary" ? null : prev))
                }
                placeholder="AI will generate this, or you can write your own..."
                disabled={disableInputs}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="headline"
            className="rounded-lg border border-input/80 bg-muted/20 px-0"
          >
            <AccordionTrigger className="px-3 py-2 text-sm font-medium hover:no-underline">
              Headline
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-1">
              <label
                htmlFor="tailor-headline"
                className="sr-only text-sm font-medium"
              >
                Tailored Headline
              </label>
              <input
                id="tailor-headline"
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                onFocus={() => setActiveField("headline")}
                onBlur={() =>
                  setActiveField((prev) => (prev === "headline" ? null : prev))
                }
                placeholder="Tailor the headline for this role..."
                disabled={disableInputs}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="skills"
            className="rounded-lg border border-input/80 bg-muted/20 px-0"
          >
            <AccordionTrigger className="px-3 py-2 text-sm font-medium hover:no-underline">
              Tailored Skills
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-1">
              <div className="flex flex-wrap items-center justify-end gap-2 pb-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddSkillGroup}
                  disabled={disableInputs}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Skill Group
                </Button>
              </div>

              {skillsDraft.length === 0 ? (
                <div className="rounded-md border border-dashed border-input px-3 py-4 text-xs text-center text-muted-foreground">
                  No skill groups yet. Add one to manually control skill
                  keywords.
                </div>
              ) : (
                <Accordion
                  type="single"
                  collapsible
                  value={openSkillGroupId}
                  onValueChange={(value) => setOpenSkillGroupId(value)}
                  className="space-y-2"
                >
                  {skillsDraft.map((group, index) => (
                    <AccordionItem
                      key={group.id}
                      value={group.id}
                      className="rounded-md border border-input px-0"
                    >
                      <AccordionTrigger className="px-3 py-2 text-xs font-medium hover:no-underline">
                        {group.name.trim() || `Skill Group ${index + 1}`}
                      </AccordionTrigger>
                      <AccordionContent className="px-3 pb-3 pt-1">
                        <div className="space-y-2">
                          <div className="space-y-1">
                            <label
                              htmlFor={`tailor-skill-group-name-${group.id}`}
                              className="text-xs font-medium text-muted-foreground"
                            >
                              Category
                            </label>
                            <input
                              id={`tailor-skill-group-name-${group.id}`}
                              type="text"
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              value={group.name}
                              onChange={(e) =>
                                handleUpdateSkillGroup(
                                  group.id,
                                  "name",
                                  e.target.value,
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
                              className="text-xs font-medium text-muted-foreground"
                            >
                              Keywords (comma-separated)
                            </label>
                            <input
                              id={`tailor-skill-group-keywords-${group.id}`}
                              type="text"
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              value={group.keywordsText}
                              onChange={(e) =>
                                handleUpdateSkillGroup(
                                  group.id,
                                  "keywordsText",
                                  e.target.value,
                                )
                              }
                              onFocus={() => setActiveField("skills")}
                              onBlur={() =>
                                setActiveField((prev) =>
                                  prev === "skills" ? null : prev,
                                )
                              }
                              placeholder="TypeScript, Node.js, APIs..."
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
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem
            value="projects"
            className="rounded-lg border border-input/80 bg-muted/20 px-0"
          >
            <AccordionTrigger className="px-3 py-2 text-sm font-medium hover:no-underline">
              Selected Projects
            </AccordionTrigger>
            <AccordionContent className="px-3 pb-3 pt-1">
              <div className="space-y-3">
                <div className="flex flex-wrap items-start gap-2 sm:items-center sm:justify-between">
                  <span className="text-sm font-medium">Selected Projects</span>
                  {tooManyProjects && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                      <AlertTriangle className="h-3 w-3" />
                      Warning: More than {maxProjects} projects might make the
                      resume too long.
                    </span>
                  )}
                </div>
                <div className="grid gap-2 max-h-[300px] overflow-auto pr-2">
                  {catalog.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50"
                    >
                      <Checkbox
                        id={`project-${project.id}`}
                        checked={selectedIds.has(project.id)}
                        onCheckedChange={() => handleToggleProject(project.id)}
                        className="mt-1"
                      />
                      <label
                        htmlFor={`project-${project.id}`}
                        className="flex flex-1 flex-col gap-1 cursor-pointer"
                      >
                        <span className="font-semibold">{project.name}</span>
                        <span className="text-xs text-muted-foreground line-clamp-2">
                          {project.description}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        <div className="flex justify-end border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            Save Selection
          </Button>
        </div>
      </div>
    </div>
  );
};
