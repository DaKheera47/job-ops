import * as api from "@client/api";
import {
  allDesignResumeSections,
  bucketResumeSectionItemCounts,
  DESIGN_RESUME_NAV_GROUPS,
  type DesignResumeMobileView,
  type DesignResumeSectionId,
  getImportFileType,
  getSectionWorkspaceCopy,
} from "@client/components/design-resume/constants";
import type { ItemDefinition } from "@client/components/design-resume/definitions";
import {
  asArray,
  asRecord,
  fileToDataUrl,
  getDesignResumeDialogItem,
  makeDownload,
  toText,
} from "@client/components/design-resume/utils";
import type { SectionWorkspaceBadge } from "@client/components/section-workspace/SectionWorkspace";
import { useDesignResume } from "@client/hooks/useDesignResume";
import { useSettings } from "@client/hooks/useSettings";
import { useTracerReadiness } from "@client/hooks/useTracerReadiness";
import type {
  DesignResumeDocument,
  DesignResumeJson,
  PdfRenderer,
  TypstTheme,
} from "@shared/types";
import { PDF_RENDERER_LABELS, TYPST_THEME_LABELS } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import { downloadDesignResumePdf } from "@/client/lib/private-pdf";
import { trackProductEvent } from "@/lib/analytics";
import { queryKeys } from "../lib/queryKeys";

export function useDesignResumeStudio() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { section: sectionParam } = useParams<{ section?: string }>();
  const { document, status, isLoading, error } = useDesignResume();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { readiness: tracerReadiness } = useTracerReadiness();
  const [draft, setDraft] = useState<DesignResumeDocument | null>(null);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [dialogState, setDialogState] = useState<{
    definition: ItemDefinition;
    index: number | null;
    seed: Record<string, unknown> | null;
  } | null>(null);
  const [pictureUploading, setPictureUploading] = useState(false);
  const [resumeImporting, setResumeImporting] = useState(false);
  const [showReimportConfirm, setShowReimportConfirm] = useState(false);
  const [mobileSectionPickerOpen, setMobileSectionPickerOpen] = useState(false);
  const [mobileWorkspaceView, setMobileWorkspaceView] =
    useState<DesignResumeMobileView>(() => (sectionParam ? "edit" : "preview"));
  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [rendererUpdating, setRendererUpdating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const editVersionRef = useRef(0);
  const draftRef = useRef<DesignResumeDocument | null>(null);
  const readyPdfRefreshToastShownRef = useRef(false);
  draftRef.current = draft;

  const notifyReadyPdfRefresh = useCallback(() => {
    if (readyPdfRefreshToastShownRef.current) return;
    readyPdfRefreshToastShownRef.current = true;
    toast.info("Ready PDFs will refresh automatically.");
  }, []);

  const pdfRenderer = settings?.pdfRenderer?.value ?? "rxresume";
  const typstTheme = settings?.typstTheme?.value ?? "classic";
  const canDownloadPdf = status?.exists && !pdfDownloading;
  const pictureEnabled = Boolean(tracerReadiness?.isPubliclyAvailable);
  const pictureDisabledReason =
    tracerReadiness?.reason ??
    "Pictures require JobOps to be reachable at a public URL.";
  const activeSection = sectionParam ?? null;
  const activeSectionIsValid =
    activeSection == null ||
    allDesignResumeSections.some((item) => item.id === activeSection);

  useEffect(() => {
    setMobileWorkspaceView(sectionParam ? "edit" : "preview");
    setMobileSectionPickerOpen(false);
  }, [sectionParam]);

  useEffect(() => {
    if (!document || dirty) return;
    setDraft(document);
  }, [document, dirty]);

  useEffect(() => {
    if (
      !draft ||
      !document ||
      !dirty ||
      saveState === "saving" ||
      saveState === "error"
    ) {
      return;
    }

    const timer = window.setTimeout(async () => {
      const editVersionAtStart = editVersionRef.current;
      const baseRevision = draft.revision;
      const documentSnapshot = structuredClone(draft.resumeJson);

      try {
        setSaveState("saving");
        const updated = await api.updateDesignResume({
          baseRevision,
          document: documentSnapshot,
        });
        if (editVersionRef.current === editVersionAtStart) {
          queryClient.setQueryData(queryKeys.designResume.current(), updated);
          queryClient.setQueryData(queryKeys.designResume.status(), {
            exists: true,
            documentId: updated.id,
            updatedAt: updated.updatedAt,
          });
          setDraft(updated);
          setDirty(false);
          setSaveState("saved");
          notifyReadyPdfRefresh();
          return;
        }

        // Keep any newer local edits, but advance the base revision for the
        // next autosave cycle so stale responses never clobber in-flight work.
        setDraft((current) =>
          current
            ? {
                ...updated,
                resumeJson: current.resumeJson,
              }
            : updated,
        );
        setSaveState("idle");
      } catch (saveError) {
        setSaveState("error");
        showErrorToast(saveError, "Failed to save Resume Studio.");
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [dirty, draft, document, notifyReadyPdfRefresh, queryClient, saveState]);

  const setDesignResume = (next: DesignResumeDocument) => {
    queryClient.setQueryData(queryKeys.designResume.current(), next);
    queryClient.setQueryData(queryKeys.designResume.status(), {
      exists: true,
      documentId: next.id,
      updatedAt: next.updatedAt,
    });
    setDraft(next);
    setDirty(false);
  };

  const ensureLatestPersistedDraft =
    async (): Promise<DesignResumeDocument | null> => {
      if (!draft) return null;
      if (!dirty) return draft;
      if (saveState === "saving") {
        throw new Error(
          "Resume Studio is still saving. Try again in a moment.",
        );
      }

      const editVersionAtStart = editVersionRef.current;
      const baseRevision = draft.revision;
      const documentSnapshot = structuredClone(draft.resumeJson);

      setSaveState("saving");
      const updated = await api.updateDesignResume({
        baseRevision,
        document: documentSnapshot,
      });

      if (editVersionRef.current === editVersionAtStart) {
        setDesignResume(updated);
        setSaveState("saved");
        return updated;
      }

      const mergedResumeJson =
        draftRef.current?.resumeJson ?? updated.resumeJson;
      const mergedDraft = {
        ...updated,
        resumeJson: structuredClone(mergedResumeJson) as DesignResumeJson,
      };
      setDraft((current) =>
        current
          ? {
              ...updated,
              resumeJson: current.resumeJson,
            }
          : updated,
      );
      setDirty(true);
      setSaveState("idle");
      return mergedDraft;
    };

  const updateResumeJson = (
    updater: (resumeJson: DesignResumeJson) => DesignResumeJson,
  ) => {
    editVersionRef.current += 1;
    setDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        resumeJson: updater(current.resumeJson),
      };
    });
    setDirty(true);
    if (saveState === "saved" || saveState === "error") setSaveState("idle");
  };

  const activeDialogItem = useMemo(() => {
    if (!dialogState) return null;
    return (
      dialogState.seed ??
      (dialogState.index == null
        ? dialogState.definition.createItem()
        : getDesignResumeDialogItem(
            draft,
            dialogState.definition,
            dialogState.index,
          ))
    );
  }, [dialogState, draft]);

  const handleImport = async () => {
    const wasReimport = Boolean(status?.exists);
    try {
      setResumeImporting(true);
      const imported = await api.importDesignResumeFromRxResume();
      setDesignResume(imported);
      setSaveState("saved");
      const counts = bucketResumeSectionItemCounts(imported.resumeJson);
      trackProductEvent("resume_studio_import_completed", {
        source: "rxresume",
        result: "success",
        was_reimport: wasReimport,
        section_count_bucket: counts.sectionCountBucket,
        item_count_bucket: counts.itemCountBucket,
      });
      if (!wasReimport) {
        trackProductEvent("resume_studio_activation_completed", {
          source: "rxresume",
        });
      }
      toast.success("Imported your resume.");
      notifyReadyPdfRefresh();
    } catch (importError) {
      trackProductEvent("resume_studio_import_completed", {
        source: "rxresume",
        result: "error",
        was_reimport: wasReimport,
        section_count_bucket: "0",
        item_count_bucket: "0",
      });
      showErrorToast(importError, "Failed to import your resume.");
    } finally {
      setResumeImporting(false);
    }
  };

  const handleImportWithConfirm = () => {
    if (status?.exists) {
      setShowReimportConfirm(true);
    } else {
      void handleImport();
    }
  };

  const handleImportFile = async (file: File) => {
    const wasReimport = Boolean(status?.exists);
    const fileType = getImportFileType(file);
    try {
      setResumeImporting(true);
      const dataUrl = await fileToDataUrl(file);
      const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());

      if (!match) {
        throw new Error("Resume file could not be encoded for upload.");
      }

      const imported = await api.importDesignResumeFromFile({
        fileName: file.name,
        mediaType: file.type || match[1],
        dataBase64: match[2],
      });
      setDesignResume(imported);
      setSaveState("saved");
      const counts = bucketResumeSectionItemCounts(imported.resumeJson);
      trackProductEvent("resume_studio_import_completed", {
        source: "file",
        file_type: fileType,
        result: "success",
        was_reimport: wasReimport,
        section_count_bucket: counts.sectionCountBucket,
        item_count_bucket: counts.itemCountBucket,
      });
      if (!wasReimport) {
        trackProductEvent("resume_studio_activation_completed", {
          source: "file",
        });
      }
      toast.success("Imported your resume file.");
      notifyReadyPdfRefresh();
    } catch (importError) {
      setSaveState("error");
      trackProductEvent("resume_studio_import_completed", {
        source: "file",
        file_type: fileType,
        result: "error",
        was_reimport: wasReimport,
        section_count_bucket: "0",
        item_count_bucket: "0",
      });
      showErrorToast(importError, "Failed to import your resume file.");
    } finally {
      setResumeImporting(false);
      if (importFileInputRef.current) {
        importFileInputRef.current.value = "";
      }
    }
  };

  const handleExport = async () => {
    try {
      const exported = await api.exportDesignResume();
      makeDownload(exported.fileName, exported.document);
      trackProductEvent("resume_studio_export_completed", {
        result: "success",
      });
      toast.success("Exported your resume JSON.");
    } catch (exportError) {
      trackProductEvent("resume_studio_export_completed", { result: "error" });
      showErrorToast(exportError, "Failed to export Resume Studio.");
    }
  };

  const handleDownloadPdf = async () => {
    const downloadedAfterEdit = dirty || saveState === "saving";
    try {
      setPdfDownloading(true);
      const generated = await api.generateDesignResumePdf();
      await downloadDesignResumePdf(generated.fileName, generated.pdfUrl);
      trackProductEvent("resume_studio_pdf_downloaded", {
        renderer: pdfRenderer,
        theme: typstTheme,
        after_edit: downloadedAfterEdit,
        result: "success",
      });
      toast.success("Your PDF is ready.");
    } catch (downloadError) {
      trackProductEvent("resume_studio_pdf_downloaded", {
        renderer: pdfRenderer,
        theme: typstTheme,
        after_edit: downloadedAfterEdit,
        result: "error",
      });
      showErrorToast(downloadError, "Failed to generate a PDF.");
    } finally {
      setPdfDownloading(false);
    }
  };

  const handleUploadPicture = async (file: File) => {
    if (!pictureEnabled) {
      toast.error(pictureDisabledReason);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    try {
      setPictureUploading(true);
      const latestDraft = await ensureLatestPersistedDraft();
      if (!latestDraft) return;

      const editVersionAtStart = editVersionRef.current;
      const updated = await api.uploadDesignResumePictureFile({
        file,
        baseRevision: latestDraft.revision,
      });
      if (editVersionRef.current === editVersionAtStart) {
        setDesignResume(updated);
      } else {
        setDraft((current) =>
          current
            ? {
                ...updated,
                resumeJson: current.resumeJson,
              }
            : updated,
        );
        setDirty(true);
        setSaveState("idle");
      }
      toast.success("Picture uploaded.");
      notifyReadyPdfRefresh();
    } catch (uploadError) {
      showErrorToast(uploadError, "Failed to upload picture.");
    } finally {
      setPictureUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeletePicture = async () => {
    try {
      const latestDraft = await ensureLatestPersistedDraft();
      if (!latestDraft) return;

      const editVersionAtStart = editVersionRef.current;
      const updated = await api.deleteDesignResumePicture({
        baseRevision: latestDraft.revision,
        document: latestDraft.resumeJson,
      });
      if (editVersionRef.current === editVersionAtStart) {
        setDesignResume(updated);
      } else {
        setDraft((current) =>
          current
            ? {
                ...updated,
                resumeJson: current.resumeJson,
              }
            : updated,
        );
        setDirty(true);
        setSaveState("idle");
      }
      toast.success("Picture removed.");
      notifyReadyPdfRefresh();
    } catch (deleteError) {
      showErrorToast(deleteError, "Failed to delete picture.");
    }
  };

  const handlePdfRendererChange = async (nextRenderer: PdfRenderer) => {
    if (settingsLoading || nextRenderer === pdfRenderer) return;

    try {
      setRendererUpdating(true);
      const updatedSettings = await api.updateSettings({
        pdfRenderer: nextRenderer,
      });
      queryClient.setQueryData(queryKeys.settings.current(), updatedSettings);
      toast.success(`${PDF_RENDERER_LABELS[nextRenderer]} is now active.`);
      notifyReadyPdfRefresh();
    } catch (updateError) {
      showErrorToast(updateError, "Failed to update the resume template.");
    } finally {
      setRendererUpdating(false);
    }
  };

  const handleTypstThemeChange = async (nextTheme: TypstTheme) => {
    if (settingsLoading || nextTheme === typstTheme) return;

    try {
      setRendererUpdating(true);
      const updatedSettings = await api.updateSettings({
        typstTheme: nextTheme,
      });
      queryClient.setQueryData(queryKeys.settings.current(), updatedSettings);
      toast.success(`${TYPST_THEME_LABELS[nextTheme]} Typst theme is active.`);
      notifyReadyPdfRefresh();
    } catch (updateError) {
      showErrorToast(updateError, "Failed to update the Typst theme.");
    } finally {
      setRendererUpdating(false);
    }
  };

  const activeSectionMeta = getSectionWorkspaceCopy(activeSection, draft);
  const activeGroup = activeSection
    ? DESIGN_RESUME_NAV_GROUPS.find((group) =>
        group.items.some((item) => item.id === activeSection),
      )
    : null;

  const handleMobileSectionSelect = (sectionId: DesignResumeSectionId) => {
    setMobileWorkspaceView("edit");
    setMobileSectionPickerOpen(false);
    navigate(`/design-resume/${sectionId}`);
  };

  const getDesignResumeSectionBadge = useCallback(
    (sectionId: DesignResumeSectionId): SectionWorkspaceBadge | null => {
      if (!draft) return null;
      const resumeJson = draft.resumeJson as Record<string, unknown>;
      if (sectionId === "basics") {
        const basics = asRecord(resumeJson.basics) ?? {};
        return toText(basics.name) || toText(basics.headline)
          ? { label: "Ready", variant: "outline" }
          : { label: "Empty", variant: "secondary" };
      }
      if (sectionId === "summary") {
        const summary = asRecord(resumeJson.summary) ?? {};
        return toText(summary.content)
          ? { label: "Ready", variant: "outline" }
          : { label: "Empty", variant: "secondary" };
      }
      if (sectionId === "picture") {
        const picture = asRecord(resumeJson.picture) ?? {};
        return toText(picture.url)
          ? { label: "Uploaded", variant: "outline" }
          : { label: "Optional", variant: "secondary" };
      }
      if (sectionId === "basics-custom-fields") {
        const basics = asRecord(resumeJson.basics) ?? {};
        const count = asArray(basics.customFields).length;
        return {
          label: count === 0 ? "Empty" : `${count}`,
          variant: "secondary",
        };
      }

      const sections = asRecord(resumeJson.sections) ?? {};
      const section = asRecord(sections[sectionId]) ?? {};
      const count = asArray(section.items).length;
      return {
        label: count === 0 ? "Empty" : `${count}`,
        variant: count === 0 ? "secondary" : "outline",
      };
    },
    [draft],
  );

  return {
    draft,
    dirty,
    saveState,
    dialogState,
    pictureUploading,
    resumeImporting,
    showReimportConfirm,
    mobileSectionPickerOpen,
    mobileWorkspaceView,
    pdfDownloading,
    rendererUpdating,
    settingsLoading,
    isLoading,
    error,
    status,
    activeSection,
    activeSectionIsValid,
    activeSectionMeta,
    activeGroup,
    activeDialogItem,
    pdfRenderer,
    typstTheme,
    canDownloadPdf,
    pictureEnabled,
    pictureDisabledReason,
    fileInputRef,
    importFileInputRef,
    setDraft,
    setDirty,
    setSaveState,
    setDialogState,
    setShowReimportConfirm,
    setMobileSectionPickerOpen,
    setMobileWorkspaceView,
    updateResumeJson,
    handleImport,
    handleImportWithConfirm,
    handleImportFile,
    handleExport,
    handleDownloadPdf,
    handleUploadPicture,
    handleDeletePicture,
    handlePdfRendererChange,
    handleTypstThemeChange,
    handleMobileSectionSelect,
    getDesignResumeSectionBadge,
  };
}
