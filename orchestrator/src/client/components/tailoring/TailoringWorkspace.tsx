import * as api from "@client/api";
import { useProfile } from "@client/hooks/useProfile";
import { useTracerReadiness } from "@client/hooks/useTracerReadiness";
import type { Job } from "@shared/types.js";
import {
  ArrowLeft,
  Check,
  CircleAlert,
  FileText,
  Loader2,
  RefreshCcw,
  Sparkles,
} from "lucide-react";
import type React from "react";
import type { ComponentProps } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatUserFacingError } from "@/client/lib/error-format";
import { showErrorToast } from "@/client/lib/error-toast";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fromEditableSkillGroups,
  getOriginalHeadline,
  getOriginalSkills,
  getOriginalSummary,
  parseTailoredSkills,
  serializeTailoredSkills,
  toEditableSkillGroups,
} from "../tailoring-utils";
import { canFinalizeTailoring } from "./rules";
import { TailoringSections } from "./TailoringSections";
import {
  getTailoringSavePayloadKey,
  type TailoringSavePayload,
  useTailoringDraft,
} from "./useTailoringDraft";

interface TailoringWorkspaceBaseProps {
  job: Job;
  onDirtyChange?: (isDirty: boolean) => void;
}

interface TailoringWorkspaceEditorProps extends TailoringWorkspaceBaseProps {
  mode: "editor";
  onUpdate: () => void | Promise<void>;
  onRegisterSave?: (save: () => Promise<void>) => void;
  onBeforeGenerate?: () => boolean | Promise<boolean>;
}

interface TailoringWorkspaceTailorProps extends TailoringWorkspaceBaseProps {
  mode: "tailor";
  onBack: () => void;
  onFinalize: () => void;
  isFinalizing: boolean;
  variant?: "discovered" | "ready";
}

type TailoringWorkspaceProps =
  | TailoringWorkspaceEditorProps
  | TailoringWorkspaceTailorProps;
type TailoringSectionsProps = ComponentProps<typeof TailoringSections>;

interface TailoringBaseline {
  summary: string;
  headline: string;
  skillsJson: string;
}

type AutosaveStatus = "saved" | "unsaved" | "saving" | "error";

const AutosaveStatusIcon: React.FC<{ status: AutosaveStatus }> = ({
  status,
}) => {
  const copy =
    status === "saving"
      ? "Saving..."
      : status === "unsaved"
        ? "Unsaved changes"
        : status === "error"
          ? "Save failed"
          : "Saved";
  const iconClassName =
    status === "error"
      ? "text-rose-300"
      : status === "unsaved"
        ? "text-amber-300"
        : status === "saving"
          ? "text-muted-foreground"
          : "text-emerald-400/80";

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground"
            role="img"
            aria-label={copy}
          >
            {status === "saving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : status === "error" || status === "unsaved" ? (
              <CircleAlert className={`h-3.5 w-3.5 ${iconClassName}`} />
            ) : (
              <Check className={`h-3.5 w-3.5 ${iconClassName}`} />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{copy}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

const normalizeSkillsJson = (value: string | null | undefined) =>
  serializeTailoredSkills(parseTailoredSkills(value));

const toBaselineFromJob = (job: Job): TailoringBaseline => ({
  summary: job.tailoredSummary ?? "",
  headline: job.tailoredHeadline ?? "",
  skillsJson: normalizeSkillsJson(job.tailoredSkills),
});

const toSavePayloadFromJob = (job: Job): TailoringSavePayload => ({
  tailoredSummary: job.tailoredSummary ?? "",
  tailoredHeadline: job.tailoredHeadline ?? "",
  tailoredSkills: normalizeSkillsJson(job.tailoredSkills),
  jobDescription: job.jobDescription ?? "",
  selectedProjectIds: job.selectedProjectIds ?? "",
  tracerLinksEnabled: Boolean(job.tracerLinksEnabled),
});

export const TailoringWorkspace: React.FC<TailoringWorkspaceProps> = (
  props,
) => {
  const editorProps = props.mode === "editor" ? props : null;
  const tailorProps = props.mode === "tailor" ? props : null;

  const {
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
    tracerLinksEnabled,
    setTracerLinksEnabled,
    skillsDraft,
    setSkillsDraft,
    openSkillGroupId,
    setOpenSkillGroupId,
    skillsJson,
    isDirty,
    savedPayloadKey,
    applyIncomingDraft,
    markSavedSnapshot,
    markSavedJob,
    handleToggleProject,
    handleAddSkillGroup,
    handleUpdateSkillGroup,
    handleRemoveSkillGroup,
  } = useTailoringDraft({
    job: props.job,
    onDirtyChange: props.onDirtyChange,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>("saved");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  const saveAgainRef = useRef(false);
  const latestPayloadRef = useRef<TailoringSavePayload | null>(null);
  const persistedPayloadKeyRef = useRef(savedPayloadKey);
  const isMountedRef = useRef(true);
  const { profile, error: profileError } = useProfile();
  const { readiness: tracerReadiness, isChecking: isTracerReadinessChecking } =
    useTracerReadiness();

  const originalValues = useMemo(() => {
    const skillsDraft = toEditableSkillGroups(getOriginalSkills(profile));
    return {
      summary: getOriginalSummary(profile),
      headline: getOriginalHeadline(profile),
      skillsDraft,
      skillsJson: serializeTailoredSkills(fromEditableSkillGroups(skillsDraft)),
    };
  }, [profile]);
  const canUseOriginalValues = Boolean(profile) && !profileError;
  const [aiBaseline, setAiBaseline] = useState<TailoringBaseline>(() =>
    toBaselineFromJob(props.job),
  );

  useEffect(() => {
    setAiBaseline({
      summary: props.job.tailoredSummary ?? "",
      headline: props.job.tailoredHeadline ?? "",
      skillsJson: normalizeSkillsJson(props.job.tailoredSkills),
    });
  }, [
    props.job.tailoredSummary,
    props.job.tailoredHeadline,
    props.job.tailoredSkills,
  ]);

  const tracerEnableBlocked =
    !tracerLinksEnabled && !tracerReadiness?.canEnable;
  const tracerEnableBlockedReason =
    tracerReadiness?.canEnable === false
      ? (tracerReadiness.reason ??
        "Verify tracer links in Settings before enabling this job.")
      : null;

  const savePayload = useMemo<TailoringSavePayload>(
    () => ({
      tailoredSummary: summary,
      tailoredHeadline: headline,
      tailoredSkills: skillsJson,
      jobDescription,
      selectedProjectIds: selectedIdsCsv,
      tracerLinksEnabled,
    }),
    [
      summary,
      headline,
      skillsJson,
      jobDescription,
      selectedIdsCsv,
      tracerLinksEnabled,
    ],
  );
  const savePayloadKey = useMemo(
    () => getTailoringSavePayloadKey(savePayload),
    [savePayload],
  );

  useEffect(() => {
    latestPayloadRef.current = savePayload;
  }, [savePayload]);

  useEffect(() => {
    persistedPayloadKeyRef.current = savedPayloadKey;
  }, [savedPayloadKey]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, []);

  const persistCurrent = useCallback(async () => {
    const updatedJob = await api.updateJob(props.job.id, savePayload);
    applyIncomingDraft(updatedJob);
  }, [props.job.id, savePayload, applyIncomingDraft]);

  const runAutosaveLoop = useCallback(async () => {
    if (!editorProps) return;
    if (saveInFlightRef.current) {
      saveAgainRef.current = true;
      await saveInFlightRef.current;
      return;
    }

    const savePromise = (async () => {
      try {
        do {
          saveAgainRef.current = false;
          const snapshot = latestPayloadRef.current;
          if (!snapshot) return;

          if (
            getTailoringSavePayloadKey(snapshot) ===
            persistedPayloadKeyRef.current
          ) {
            if (isMountedRef.current) setAutosaveStatus("saved");
            return;
          }

          if (isMountedRef.current) setAutosaveStatus("saving");
          const snapshotKey = getTailoringSavePayloadKey(snapshot);
          const updatedJob = await api.updateJob(props.job.id, snapshot);
          if (!isMountedRef.current) return;
          const updatedPayload = toSavePayloadFromJob(updatedJob);

          const latestStillMatchesSnapshot =
            latestPayloadRef.current &&
            getTailoringSavePayloadKey(latestPayloadRef.current) ===
              snapshotKey;
          if (latestStillMatchesSnapshot) {
            markSavedSnapshot(snapshot);
            latestPayloadRef.current = snapshot;
          } else {
            markSavedJob(updatedJob);
          }
          persistedPayloadKeyRef.current = latestStillMatchesSnapshot
            ? snapshotKey
            : getTailoringSavePayloadKey(updatedPayload);

          const latestKey = latestPayloadRef.current
            ? getTailoringSavePayloadKey(latestPayloadRef.current)
            : persistedPayloadKeyRef.current;
          if (isMountedRef.current) {
            setAutosaveStatus(
              latestKey === persistedPayloadKeyRef.current
                ? "saved"
                : "unsaved",
            );
          }
        } while (
          saveAgainRef.current ||
          (latestPayloadRef.current &&
            getTailoringSavePayloadKey(latestPayloadRef.current) !==
              persistedPayloadKeyRef.current)
        );
      } catch {
        if (isMountedRef.current) setAutosaveStatus("error");
        throw new Error("Autosave failed");
      } finally {
        saveInFlightRef.current = null;
      }
    })();

    saveInFlightRef.current = savePromise;
    await savePromise;
  }, [editorProps, markSavedJob, markSavedSnapshot, props.job.id]);

  const flushAutosave = useCallback(async () => {
    if (!editorProps) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (saveInFlightRef.current) {
      saveAgainRef.current = true;
      await saveInFlightRef.current;
    }
    const latestPayload = latestPayloadRef.current;
    if (
      latestPayload &&
      getTailoringSavePayloadKey(latestPayload) !==
        persistedPayloadKeyRef.current
    ) {
      await runAutosaveLoop();
    }
  }, [editorProps, runAutosaveLoop]);

  useEffect(() => {
    if (!editorProps) return;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    if (!isDirty || savePayloadKey === persistedPayloadKeyRef.current) {
      if (!saveInFlightRef.current) setAutosaveStatus("saved");
      return;
    }

    setAutosaveStatus("unsaved");
    if (saveInFlightRef.current) {
      saveAgainRef.current = true;
      return;
    }

    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void runAutosaveLoop().catch(() => {
        // The status state already reflects the failure; keep the draft local.
      });
    }, 800);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [editorProps, isDirty, runAutosaveLoop, savePayloadKey]);

  useEffect(() => {
    if (!editorProps?.onRegisterSave) return;
    editorProps.onRegisterSave(flushAutosave);
  }, [editorProps, flushAutosave]);

  const handleSummarizeEditor = useCallback(async () => {
    if (!editorProps) return;

    try {
      setIsSummarizing(true);
      await flushAutosave();

      const updatedJob = await api.summarizeJob(props.job.id, { force: true });
      applyIncomingDraft(updatedJob);
      setAiBaseline(toBaselineFromJob(updatedJob));
      toast.success("Draft content generated");
      await editorProps.onUpdate();
    } catch (error) {
      showErrorToast(error, "AI summarization failed");
    } finally {
      setIsSummarizing(false);
    }
  }, [editorProps, flushAutosave, props.job.id, applyIncomingDraft]);

  const handleGenerateWithAi = useCallback(async () => {
    if (!tailorProps) return;

    try {
      setIsGenerating(true);

      if (isDirty) {
        await persistCurrent();
      }

      const updatedJob = await api.summarizeJob(props.job.id, { force: true });
      applyIncomingDraft(updatedJob);
      setAiBaseline(toBaselineFromJob(updatedJob));

      toast.success("Draft generated with AI", {
        description: "Review and edit before finalizing.",
      });
    } catch (error) {
      showErrorToast(error, "Failed to generate AI draft");
    } finally {
      setIsGenerating(false);
    }
  }, [tailorProps, isDirty, persistCurrent, props.job.id, applyIncomingDraft]);

  const handleGeneratePdf = useCallback(async () => {
    if (!editorProps) return;

    try {
      const shouldProceed = editorProps.onBeforeGenerate
        ? await editorProps.onBeforeGenerate()
        : true;
      if (shouldProceed === false) return;

      setIsGeneratingPdf(true);
      await flushAutosave();
      await api.generateJobPdf(props.job.id);
      toast.success("Resume PDF generated");
      await editorProps.onUpdate();
    } catch (error) {
      const message = formatUserFacingError(error, "PDF generation failed");
      if (/tracer/i.test(message)) {
        toast.error("Tracer links are unavailable right now", {
          description: message,
        });
      } else {
        showErrorToast(error, "PDF generation failed");
      }
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [editorProps, flushAutosave, props.job.id]);

  const handleFinalize = useCallback(async () => {
    if (!tailorProps) return;

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

    tailorProps.onFinalize();
  }, [tailorProps, isDirty, persistCurrent]);

  const handleUndoSummary = useCallback(() => {
    setSummary(originalValues.summary);
  }, [originalValues.summary, setSummary]);

  const handleUndoHeadline = useCallback(() => {
    setHeadline(originalValues.headline);
  }, [originalValues.headline, setHeadline]);

  const handleUndoSkills = useCallback(() => {
    setSkillsDraft(originalValues.skillsDraft);
  }, [originalValues.skillsDraft, setSkillsDraft]);

  const handleRedoSummary = useCallback(() => {
    setSummary(aiBaseline.summary);
  }, [aiBaseline.summary, setSummary]);

  const handleRedoHeadline = useCallback(() => {
    setHeadline(aiBaseline.headline);
  }, [aiBaseline.headline, setHeadline]);

  const handleRedoSkills = useCallback(() => {
    setSkillsDraft(
      toEditableSkillGroups(parseTailoredSkills(aiBaseline.skillsJson)),
    );
  }, [aiBaseline.skillsJson, setSkillsDraft]);

  const disableInputs = editorProps
    ? isSummarizing || isGeneratingPdf || isSaving
    : isGenerating || Boolean(tailorProps?.isFinalizing) || isSaving;

  const canFinalize = canFinalizeTailoring(summary);
  const tailoringSectionsProps = useMemo<TailoringSectionsProps>(
    () => ({
      catalog,
      isCatalogLoading,
      summary,
      headline,
      jobDescription,
      skillsDraft,
      selectedIds,
      tracerLinksEnabled,
      tracerEnableBlocked,
      tracerEnableBlockedReason,
      tracerReadinessChecking: isTracerReadinessChecking,
      openSkillGroupId,
      disableInputs,
      onSummaryChange: setSummary,
      onHeadlineChange: setHeadline,
      onUndoSummary: handleUndoSummary,
      onUndoHeadline: handleUndoHeadline,
      onUndoSkills: handleUndoSkills,
      onRedoSummary: handleRedoSummary,
      onRedoHeadline: handleRedoHeadline,
      onRedoSkills: handleRedoSkills,
      canUndoSummary:
        canUseOriginalValues && summary !== originalValues.summary,
      canUndoHeadline:
        canUseOriginalValues && headline !== originalValues.headline,
      canUndoSkills:
        canUseOriginalValues && skillsJson !== originalValues.skillsJson,
      canRedoSummary: summary !== aiBaseline.summary,
      canRedoHeadline: headline !== aiBaseline.headline,
      canRedoSkills: skillsJson !== aiBaseline.skillsJson,
      undoDisabledReason: canUseOriginalValues
        ? null
        : "Original base CV unavailable.",
      onDescriptionChange: setJobDescription,
      onSkillGroupOpenChange: setOpenSkillGroupId,
      onAddSkillGroup: handleAddSkillGroup,
      onUpdateSkillGroup: handleUpdateSkillGroup,
      onRemoveSkillGroup: handleRemoveSkillGroup,
      onToggleProject: handleToggleProject,
      onTracerLinksEnabledChange: setTracerLinksEnabled,
    }),
    [
      catalog,
      isCatalogLoading,
      summary,
      headline,
      jobDescription,
      skillsDraft,
      selectedIds,
      tracerLinksEnabled,
      tracerEnableBlocked,
      tracerEnableBlockedReason,
      isTracerReadinessChecking,
      openSkillGroupId,
      disableInputs,
      setSummary,
      setHeadline,
      handleUndoSummary,
      handleUndoHeadline,
      handleUndoSkills,
      handleRedoSummary,
      handleRedoHeadline,
      handleRedoSkills,
      canUseOriginalValues,
      originalValues,
      skillsJson,
      aiBaseline,
      setJobDescription,
      setOpenSkillGroupId,
      handleAddSkillGroup,
      handleUpdateSkillGroup,
      handleRemoveSkillGroup,
      handleToggleProject,
      setTracerLinksEnabled,
    ],
  );

  if (editorProps) {
    return (
      <div className="space-y-5">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(260px,0.75fr)]">
          <div className="flex min-h-16 items-center justify-between gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-emerald-500/50 bg-emerald-500/10 text-emerald-300">
                <Check className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground/90">
                  Draft ready
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/75">
                  Review required sections before generating the PDF.
                </p>
              </div>
            </div>
            <AutosaveStatusIcon status={autosaveStatus} />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <Button
              onClick={handleSummarizeEditor}
              disabled={isSummarizing || isGeneratingPdf}
              variant="outline"
              size="sm"
            >
              {isSummarizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Generate with AI
            </Button>
            <Button
              onClick={handleGeneratePdf}
              disabled={isSummarizing || isGeneratingPdf || !summary}
              size="sm"
            >
              {isGeneratingPdf ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              Generate PDF
            </Button>
          </div>
        </div>

        <TailoringSections {...tailoringSectionsProps} />
      </div>
    );
  }
};
