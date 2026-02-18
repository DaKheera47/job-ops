import type { Job, ResumeProjectCatalogItem } from "@shared/types.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "../../api";
import {
  createTailoredSkillDraftId,
  type EditableSkillGroup,
  fromEditableSkillGroups,
  parseTailoredSkills,
  serializeTailoredSkills,
  toEditableSkillGroups,
} from "../tailoring-utils";

const parseSelectedIds = (value: string | null | undefined) =>
  new Set(value?.split(",").filter(Boolean) ?? []);

const hasSelectionDiff = (current: Set<string>, saved: Set<string>) => {
  if (current.size !== saved.size) return true;
  for (const id of current) {
    if (!saved.has(id)) return true;
  }
  return false;
};

const parseIncomingDraft = (incomingJob: Job) => {
  const summary = incomingJob.tailoredSummary || "";
  const headline = incomingJob.tailoredHeadline || "";
  const description = incomingJob.jobDescription || "";
  const selectedIds = parseSelectedIds(incomingJob.selectedProjectIds);
  const skillsDraft = toEditableSkillGroups(
    parseTailoredSkills(incomingJob.tailoredSkills),
  );
  const skillsJson = serializeTailoredSkills(
    fromEditableSkillGroups(skillsDraft),
  );
  const tracerLinksEnabled = Boolean(incomingJob.tracerLinksEnabled);

  return {
    summary,
    headline,
    description,
    selectedIds,
    skillsDraft,
    skillsJson,
    tracerLinksEnabled,
  };
};

interface UseTailoringDraftParams {
  job: Job;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function useTailoringDraft({
  job,
  onDirtyChange,
}: UseTailoringDraftParams) {
  const [catalog, setCatalog] = useState<ResumeProjectCatalogItem[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
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
  const [tracerLinksEnabled, setTracerLinksEnabled] = useState(
    Boolean(job.tracerLinksEnabled),
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
  const [savedTracerLinksEnabled, setSavedTracerLinksEnabled] = useState(
    Boolean(job.tracerLinksEnabled),
  );

  const lastJobIdRef = useRef(job.id);
  const jobRef = useRef(job);

  const skillsJson = useMemo(
    () => serializeTailoredSkills(fromEditableSkillGroups(skillsDraft)),
    [skillsDraft],
  );

  const selectedIdsCsv = useMemo(
    () => Array.from(selectedIds).join(","),
    [selectedIds],
  );

  const isDirty = useMemo(() => {
    if (summary !== savedSummary) return true;
    if (headline !== savedHeadline) return true;
    if (jobDescription !== savedDescription) return true;
    if (skillsJson !== savedSkillsJson) return true;
    if (tracerLinksEnabled !== savedTracerLinksEnabled) return true;
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
    tracerLinksEnabled,
    savedTracerLinksEnabled,
    selectedIds,
    savedSelectedIds,
  ]);

  const applyIncomingDraft = useCallback((incomingJob: Job) => {
    const next = parseIncomingDraft(incomingJob);
    setSummary(next.summary);
    setHeadline(next.headline);
    setJobDescription(next.description);
    setSelectedIds(next.selectedIds);
    setSkillsDraft(next.skillsDraft);
    setSavedSummary(next.summary);
    setSavedHeadline(next.headline);
    setSavedDescription(next.description);
    setSavedSelectedIds(next.selectedIds);
    setSavedSkillsJson(next.skillsJson);
    setTracerLinksEnabled(next.tracerLinksEnabled);
    setSavedTracerLinksEnabled(next.tracerLinksEnabled);
  }, []);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => onDirtyChange?.(false);
  }, [onDirtyChange]);

  useEffect(() => {
    setIsCatalogLoading(true);
    api
      .getResumeProjectsCatalog()
      .then(setCatalog)
      .catch(() => setCatalog([]))
      .finally(() => setIsCatalogLoading(false));
  }, []);

  useEffect(() => {
    jobRef.current = job;
  }, [job]);

  // Only sync when job ID changes (user switched to a different job)
  // User edits persist until explicitly saved - no auto-sync from server
  useEffect(() => {
    if (job.id !== lastJobIdRef.current) {
      lastJobIdRef.current = job.id;
      applyIncomingDraft(jobRef.current);
    }
  }, [job.id, applyIncomingDraft]);

  useEffect(() => {
    if (
      openSkillGroupId.length > 0 &&
      !skillsDraft.some((group) => group.id === openSkillGroupId)
    ) {
      setOpenSkillGroupId("");
    }
  }, [skillsDraft, openSkillGroupId]);

  const handleToggleProject = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddSkillGroup = useCallback(() => {
    const nextId = createTailoredSkillDraftId();
    setSkillsDraft((prev) => [
      ...prev,
      { id: nextId, name: "", keywordsText: "" },
    ]);
    setOpenSkillGroupId(nextId);
  }, []);

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

  return {
    catalog,
    isCatalogLoading,
    summary,
    setSummary,
    headline,
    setHeadline,
    jobDescription,
    setJobDescription,
    selectedIds,
    selectedIdsCsv,
    skillsDraft,
    openSkillGroupId,
    setOpenSkillGroupId,
    skillsJson,
    tracerLinksEnabled,
    setTracerLinksEnabled,
    isDirty,
    applyIncomingDraft,
    handleToggleProject,
    handleAddSkillGroup,
    handleUpdateSkillGroup,
    handleRemoveSkillGroup,
  };
}
