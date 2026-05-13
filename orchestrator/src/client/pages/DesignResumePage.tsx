import * as api from "@client/api";
import { DesignResumePreviewPanel } from "@client/components/design-resume/DesignResumePreviewPanel";
import { DesignResumeRail } from "@client/components/design-resume/DesignResumeRail";
import { ItemDialog } from "@client/components/design-resume/ItemDialog";
import { PageHeader, PageMain } from "@client/components/layout";
import {
  type SectionWorkspaceBadge,
  type SectionWorkspaceGroup,
  SectionWorkspacePanel,
} from "@client/components/section-workspace/SectionWorkspace";
import { useDesignResume } from "@client/hooks/useDesignResume";
import { useSettings } from "@client/hooks/useSettings";
import { useTracerReadiness } from "@client/hooks/useTracerReadiness";
import type {
  DesignResumeDocument,
  DesignResumeJson,
  PdfRenderer,
} from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import {
  Award,
  BookOpen,
  BriefcaseBusiness,
  Download,
  Eye,
  FileDown,
  FileText,
  Folder,
  GraduationCap,
  HeartHandshake,
  ImageIcon,
  Import,
  Languages,
  Link2,
  ListPlus,
  type LucideIcon,
  MoreHorizontal,
  PenSquare,
  Quote,
  ScrollText,
  Sparkles,
  Trophy,
  UserRound,
  Wrench,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import { downloadDesignResumePdf } from "@/client/lib/private-pdf";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  ITEM_DEFINITIONS,
  type ItemDefinition,
} from "../components/design-resume/definitions";
import {
  asArray,
  asRecord,
  fileToDataUrl,
  getByPath,
  getDesignResumeDialogItem,
  makeDownload,
  toText,
} from "../components/design-resume/utils";
import { formatUserFacingError } from "../lib/error-format";
import { queryKeys } from "../lib/queryKeys";

type DesignResumeSectionId = string;
type DesignResumeGroupId = "profile" | "sections";
type DesignResumeNavItem = {
  id: DesignResumeSectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  sectionId?: DesignResumeSectionId | null;
};
type DesignResumeIconGroupId = "preview" | DesignResumeGroupId;
type DesignResumeNavGroup = {
  id: DesignResumeIconGroupId;
  label: string;
  items: DesignResumeNavItem[];
};

const SECTION_ICON_BY_ID: Record<string, LucideIcon> = {
  profiles: Link2,
  experience: BriefcaseBusiness,
  education: GraduationCap,
  projects: Folder,
  skills: Wrench,
  languages: Languages,
  interests: Sparkles,
  awards: Trophy,
  certifications: Award,
  publications: ScrollText,
  volunteer: HeartHandshake,
  references: Quote,
};

const DESIGN_RESUME_PROFILE_SECTIONS: SectionWorkspaceGroup<
  DesignResumeGroupId,
  DesignResumeSectionId
>["items"] = [
  {
    id: "basics",
    label: "Contact",
    description: "Name, headline, and contact details.",
    searchTerms: ["basics", "headline", "email", "phone", "location"],
  },
  {
    id: "summary",
    label: "Summary",
    description: "Short intro shown near the top of your resume.",
    searchTerms: ["intro", "profile", "overview"],
  },
  {
    id: "picture",
    label: "Picture",
    description: "Resume photo and picture presentation.",
    searchTerms: ["photo", "avatar", "image"],
  },
  {
    id: "basics-custom-fields",
    label: "Custom Fields",
    description: "Extra links or short details near your contact info.",
    searchTerms: ["links", "custom", "details"],
  },
];

const DESIGN_RESUME_ICON_GROUPS: DesignResumeNavGroup[] = [
  {
    id: "preview",
    label: "Preview",
    items: [
      {
        id: "live-preview",
        label: "Live preview",
        description: "See a preview of your resume as you edit it.",
        icon: Eye,
        sectionId: null,
      },
    ],
  },
  {
    id: "profile",
    label: "Profile",
    items: [
      {
        id: "basics",
        label: "Contact",
        description: "Name, headline, and contact details.",
        icon: UserRound,
      },
      {
        id: "summary",
        label: "Summary",
        description: "Short intro shown near the top of your resume.",
        icon: FileText,
      },
      {
        id: "picture",
        label: "Picture",
        description: "Resume photo and picture presentation.",
        icon: ImageIcon,
      },
      {
        id: "basics-custom-fields",
        label: "Custom Fields",
        description: "Extra links or short details near your contact info.",
        icon: ListPlus,
      },
    ],
  },
  {
    id: "sections",
    label: "Resume Sections",
    items: ITEM_DEFINITIONS.map((definition) => ({
      id: definition.key,
      label: definition.title,
      description: definition.description,
      icon: SECTION_ICON_BY_ID[definition.key] ?? BookOpen,
    })),
  },
];

const DESIGN_RESUME_NAV_GROUPS: SectionWorkspaceGroup<
  DesignResumeGroupId,
  DesignResumeSectionId
>[] = [
  {
    id: "profile",
    label: "Profile",
    items: DESIGN_RESUME_PROFILE_SECTIONS,
  },
  {
    id: "sections",
    label: "Resume Sections",
    items: ITEM_DEFINITIONS.map((definition) => ({
      id: definition.key,
      label: definition.title,
      description: definition.description,
      searchTerms: [
        definition.singularTitle,
        definition.primaryField,
        definition.secondaryField ?? "",
      ].filter(Boolean),
    })),
  },
];

const allDesignResumeSections = DESIGN_RESUME_NAV_GROUPS.flatMap(
  (group) => group.items,
);

const RailIcon = ({
  item,
  sectionId,
  isActive,
  onSectionSelect,
  navItemClassName,
  navLabelClassName,
  preventMouseFocus,
  Icon,
}: {
  item: DesignResumeNavItem;
  sectionId: DesignResumeSectionId | null;
  isActive: boolean;
  onSectionSelect: (sectionId: DesignResumeSectionId | null) => void;
  navItemClassName: string;
  navLabelClassName: string;
  preventMouseFocus: (event: React.MouseEvent<HTMLButtonElement>) => void;
  Icon: LucideIcon;
}) => {
  return (
    <Button
      key={item.id}
      type="button"
      variant="ghost"
      aria-current={isActive ? "page" : undefined}
      aria-label={item.label}
      onMouseDown={preventMouseFocus}
      className={cn(
        navItemClassName,
        isActive &&
          "border border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
      )}
      onClick={() => onSectionSelect(sectionId)}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
        <Icon />
      </div>
      <span className={navLabelClassName}>{item.label}</span>
    </Button>
  );
};

type DesignResumeIconRailProps = {
  activeSectionId: DesignResumeSectionId | null;
  onSectionSelect: (sectionId: DesignResumeSectionId | null) => void;
};

function DesignResumeIconRail({
  activeSectionId,
  onSectionSelect,
}: DesignResumeIconRailProps) {
  const navItemClassName =
    "flex justify-start gap-0 overflow-hidden rounded-lg px-0 text-muted-foreground transition-[width,color,background-color,border-color] duration-200 hover:bg-accent/60 hover:text-foreground group-hover/rail:w-48 group-focus-within/rail:w-48 size-10";
  const navLabelClassName =
    "ml-3 max-w-0 overflow-hidden whitespace-nowrap text-sm opacity-0 transition-[max-width,opacity] duration-200 group-hover/rail:max-w-32 group-hover/rail:opacity-100 group-focus-within/rail:max-w-32 group-focus-within/rail:opacity-100";
  const preventMouseFocus = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <aside className="sticky top-6 z-20 w-14 self-start overflow-visible">
      <nav
        aria-label="Design Resume sections"
        className="group/rail flex h-[calc(100svh-8rem)] w-14 flex-col items-start overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-border/70 bg-card px-2 py-3 shadow-lg backdrop-blur transition-[width,box-shadow,border-color] duration-200 hover:w-52 hover:border-border hover:shadow-[18px_0_44px_rgba(0,0,0,0.42)] focus-within:w-52 focus-within:border-border focus-within:shadow-[18px_0_44px_rgba(0,0,0,0.42)]"
      >
        {DESIGN_RESUME_ICON_GROUPS.map((group) => (
          <div
            key={group.id}
            className="mt-3 flex w-full flex-col items-start gap-2 border-t border-border/60 pt-3 first:mt-0 first:border-t-0 first:pt-0"
          >
            {group.items.map((item) => {
              const Icon = item.icon;
              const sectionId =
                item.sectionId === undefined ? item.id : item.sectionId;
              const isActive = sectionId === activeSectionId;
              return (
                <RailIcon
                  key={item.id}
                  item={item}
                  sectionId={sectionId}
                  isActive={isActive}
                  onSectionSelect={onSectionSelect}
                  navItemClassName={navItemClassName}
                  navLabelClassName={navLabelClassName}
                  preventMouseFocus={preventMouseFocus}
                  Icon={Icon}
                />
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}

export const DesignResumePage: React.FC = () => {
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
    if (!document) return;
    setDraft(document);
    setDirty(false);
  }, [document]);

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
        showErrorToast(saveError, "Failed to save Design Resume.");
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
          "Design Resume is still saving. Try again in a moment.",
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
    try {
      setResumeImporting(true);
      const imported = await api.importDesignResumeFromRxResume();
      setDesignResume(imported);
      setSaveState("saved");
      toast.success("Imported your resume.");
      notifyReadyPdfRefresh();
    } catch (importError) {
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
      toast.success("Imported your resume file.");
      notifyReadyPdfRefresh();
    } catch (importError) {
      setSaveState("error");
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
      toast.success("Exported your resume JSON.");
    } catch (exportError) {
      showErrorToast(exportError, "Failed to export Design Resume.");
    }
  };

  const handleDownloadPdf = async () => {
    try {
      setPdfDownloading(true);
      const generated = await api.generateDesignResumePdf();
      await downloadDesignResumePdf(generated.fileName, generated.pdfUrl);
      toast.success("Your PDF is ready.");
    } catch (downloadError) {
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
      toast.success(
        nextRenderer === "latex"
          ? "Jake's template is now active."
          : "React Resume Renderer is now active.",
      );
      notifyReadyPdfRefresh();
    } catch (updateError) {
      showErrorToast(updateError, "Failed to update the resume template.");
    } finally {
      setRendererUpdating(false);
    }
  };

  const activeSectionMeta = activeSection
    ? allDesignResumeSections.find((item) => item.id === activeSection)
    : null;
  const activeGroup = activeSection
    ? DESIGN_RESUME_NAV_GROUPS.find((group) =>
        group.items.some((item) => item.id === activeSection),
      )
    : null;

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

  if (!activeSectionIsValid) {
    return <Navigate to="/design-resume" replace />;
  }

  if (isLoading) {
    return (
      <>
        <PageHeader
          icon={PenSquare}
          title="Design Resume"
          subtitle="Loading your resume"
        />
        <PageMain>
          <div className="rounded-2xl border border-border/70 bg-card px-6 py-20 text-center text-sm text-muted-foreground">
            Loading Design Resume...
          </div>
        </PageMain>
      </>
    );
  }

  const rail = draft ? (
    <DesignResumeRail
      draft={draft}
      onUpdateResumeJson={updateResumeJson}
      onOpenDialog={(definition, index) =>
        setDialogState({
          definition,
          index,
          seed:
            index == null
              ? definition.createItem()
              : getDesignResumeDialogItem(draft, definition, index),
        })
      }
      onUploadPicture={() => fileInputRef.current?.click()}
      onDeletePicture={handleDeletePicture}
      pictureUploading={pictureUploading}
      pictureEnabled={pictureEnabled}
      pictureDisabledReason={pictureDisabledReason}
      activeSectionId={activeSection}
    />
  ) : null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            void handleUploadPicture(file);
          }
        }}
      />
      <input
        ref={importFileInputRef}
        type="file"
        accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx"
        className="hidden"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) {
            void handleImportFile(file);
          }
        }}
      />

      <PageHeader
        icon={PenSquare}
        title="Design Resume"
        subtitle="Edit your resume details"
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap sm:justify-end">
            <div className="hidden items-center gap-2 sm:flex">
              <Button
                type="button"
                variant="outline"
                onClick={() => importFileInputRef.current?.click()}
                disabled={resumeImporting}
              >
                <Import className="mr-2 h-4 w-4" />
                {resumeImporting ? "Importing File" : "Import File"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleImportWithConfirm}
                disabled={resumeImporting}
              >
                <Import className="mr-2 h-4 w-4" />
                {resumeImporting
                  ? "Importing RxResume"
                  : status?.exists
                    ? "Re-import RxResume"
                    : "Import RxResume"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadPdf}
                disabled={!canDownloadPdf}
              >
                <FileDown className="mr-2 h-4 w-4" />
                {pdfDownloading ? "Preparing PDF" : "Download PDF"}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleExport}
                disabled={!status?.exists}
              >
                <Download className="mr-2 h-4 w-4" />
                Export
              </Button>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="ml-auto sm:hidden"
                  aria-label="Open resume actions"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onSelect={() => importFileInputRef.current?.click()}
                  disabled={resumeImporting}
                >
                  <Import className="mr-2 h-4 w-4" />
                  {resumeImporting ? "Importing File" : "Import File"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleImportWithConfirm()}
                  disabled={resumeImporting}
                >
                  <Import className="mr-2 h-4 w-4" />
                  {resumeImporting
                    ? "Importing RxResume"
                    : status?.exists
                      ? "Re-import RxResume"
                      : "Import RxResume"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleDownloadPdf()}
                  disabled={!canDownloadPdf}
                >
                  <FileDown className="mr-2 h-4 w-4" />
                  {pdfDownloading ? "Preparing PDF" : "Download PDF"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => handleExport()}
                  disabled={!status?.exists}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export JSON
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <PageMain>
        {!draft ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-border/70 bg-card px-6 py-20 text-center">
            <div className="mx-auto max-w-xl space-y-4">
              <div className="inline-flex rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Design Resume
              </div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">
                Import your resume to start editing it here.
              </h2>
              <p className="text-sm leading-7 text-muted-foreground">
                Once imported, you can update your resume here without jumping
                between tools.
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  type="button"
                  onClick={handleImport}
                  disabled={resumeImporting}
                >
                  <Import className="mr-2 h-4 w-4" />
                  {resumeImporting ? "Importing resume" : "Import resume"}
                </Button>
                {error ? (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">
                    {formatUserFacingError(
                      error,
                      "Unable to load Design Resume.",
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <div
            className={
              activeSection
                ? "grid min-w-0 gap-6 overflow-x-clip lg:grid-cols-[4rem_minmax(0,1fr)] xl:grid-cols-[4rem_minmax(360px,0.78fr)_minmax(0,1.22fr)]"
                : "grid min-w-0 gap-6 overflow-x-clip lg:grid-cols-[4rem_minmax(0,1fr)]"
            }
          >
            <DesignResumeIconRail
              activeSectionId={activeSection}
              onSectionSelect={(sectionId) =>
                navigate(
                  sectionId ? `/design-resume/${sectionId}` : "/design-resume",
                )
              }
            />

            {activeSection && activeGroup && activeSectionMeta ? (
              <SectionWorkspacePanel
                groupLabel={activeGroup.label}
                sectionLabel={activeSectionMeta.label}
                sectionDescription={activeSectionMeta.description}
                badge={getDesignResumeSectionBadge(activeSection)}
                secondaryBadge={
                  dirty
                    ? { label: "Autosaving", variant: "secondary" }
                    : saveState === "saved"
                      ? { label: "Autosaved", variant: "outline" }
                      : null
                }
              >
                {rail}
              </SectionWorkspacePanel>
            ) : null}

            <DesignResumePreviewPanel
              draft={draft}
              pdfRenderer={pdfRenderer}
              isUpdatingRenderer={rendererUpdating || settingsLoading}
              isDirty={dirty}
              saveState={saveState}
              onPdfRendererChange={handlePdfRendererChange}
              className={
                activeSection ? "lg:col-start-2 xl:col-start-auto" : undefined
              }
            />
          </div>
        )}
      </PageMain>

      {dialogState && draft ? (
        <ItemDialog
          open={Boolean(dialogState)}
          title={`${dialogState.index == null ? "Add" : "Edit"} ${dialogState.definition.singularTitle}`}
          description={dialogState.definition.description}
          item={activeDialogItem}
          fields={dialogState.definition.fields}
          resumeJson={draft.resumeJson}
          aiSection={dialogState.definition.title}
          aiItemLabel={toText(
            getByPath(
              (activeDialogItem ?? {}) as Record<string, unknown>,
              dialogState.definition.primaryField,
            ),
          )}
          aiPathPrefix={`sections.${dialogState.definition.key}.items.${dialogState.index ?? "new"}`}
          onOpenChange={(open) => {
            if (!open) setDialogState(null);
          }}
          onSave={(item) => {
            updateResumeJson((current) => {
              const next = structuredClone(current);
              const sections = (asRecord(next.sections) ?? {}) as Record<
                string,
                unknown
              >;
              const section = (asRecord(sections[dialogState.definition.key]) ??
                {}) as Record<string, unknown>;
              const items = asArray(section.items).map(
                (entry) => asRecord(entry) ?? {},
              ) as Record<string, unknown>[];
              const nextItems =
                dialogState.index == null
                  ? [...items, item]
                  : items.map((entry, index) =>
                      index === dialogState.index ? item : entry,
                    );
              next.sections = {
                ...sections,
                [dialogState.definition.key]: {
                  ...section,
                  // Ensure the edited section is visible in rendered output.
                  hidden: false,
                  items: nextItems,
                },
              } as DesignResumeJson["sections"];
              return next;
            });
          }}
          onDelete={
            dialogState.index == null
              ? undefined
              : () => {
                  updateResumeJson((current) => {
                    const next = structuredClone(current);
                    const sections = (asRecord(next.sections) ?? {}) as Record<
                      string,
                      unknown
                    >;
                    const section = (asRecord(
                      sections[dialogState.definition.key],
                    ) ?? {}) as Record<string, unknown>;
                    const items = asArray(section.items).filter(
                      (_, index) => index !== dialogState.index,
                    );
                    next.sections = {
                      ...sections,
                      [dialogState.definition.key]: {
                        ...section,
                        // Keep section visible after inline list edits.
                        hidden: false,
                        items,
                      },
                    } as DesignResumeJson["sections"];
                    return next;
                  });
                  setDialogState(null);
                }
          }
        />
      ) : null}

      <AlertDialog
        open={showReimportConfirm}
        onOpenChange={setShowReimportConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Re-import from RxResume?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace your current Design Resume with the latest data
              from RxResume. Any edits you've made here will be permanently
              overwritten and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#F1703E] text-white hover:bg-[#d9612f]"
              onClick={() => {
                setShowReimportConfirm(false);
                void handleImport();
              }}
            >
              <Import className="mr-2 h-4 w-4" />
              Re-import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
