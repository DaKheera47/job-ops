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
  TypstTheme,
} from "@shared/types";
import { PDF_RENDERER_LABELS, TYPST_THEME_LABELS } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import {
  type MotionValue,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { bucketCount, trackProductEvent } from "@/lib/analytics";
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
type DesignResumeMobileView = "edit" | "preview";

const DESIGN_RESUME_PAGE_MAIN_CLASS_NAME =
  "flex min-h-0 flex-1 flex-col space-y-0 overflow-hidden py-3 pb-3";

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
    description:
      "Short intro shown near the top of your resume. Rewritten during Job Tailoring for each application.",
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
        description:
          "Short intro shown near the top of your resume. Rewritten during Job Tailoring for each application.",
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
const DESIGN_RESUME_ICON_ITEM_BY_SECTION_ID = new Map(
  DESIGN_RESUME_ICON_GROUPS.flatMap((group) =>
    group.items.map((item) => [
      item.sectionId === undefined ? item.id : item.sectionId,
      item,
    ]),
  ),
);

function getDesignResumeSectionIcon(sectionId: DesignResumeSectionId) {
  return DESIGN_RESUME_ICON_ITEM_BY_SECTION_ID.get(sectionId)?.icon ?? BookOpen;
}

function bucketResumeSectionItemCounts(document: DesignResumeJson): {
  sectionCountBucket: string;
  itemCountBucket: string;
} {
  const sections = asRecord(document.sections) ?? {};
  const sectionCount = Object.keys(sections).length;
  const itemCount = Object.values(sections).reduce<number>((count, section) => {
    const sectionRecord = asRecord(section) ?? {};
    return count + asArray(sectionRecord.items).length;
  }, 0);
  return {
    sectionCountBucket: bucketCount(sectionCount),
    itemCountBucket: bucketCount(itemCount),
  };
}

function getImportFileType(file: File): "pdf" | "docx" | "unknown" {
  const mimeType = file.type.toLowerCase();
  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith(".pdf")) return "pdf";
  if (fileName.endsWith(".docx")) return "docx";
  return "unknown";
}

function getDeviceLayout(): "mobile" | "desktop" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return "desktop";
  return window.matchMedia("(max-width: 639px)").matches ? "mobile" : "desktop";
}

const useDockItemSize = (
  mouseY: MotionValue<number>,
  baseItemSize: number,
  magnification: number,
  distance: number,
  ref: React.RefObject<HTMLButtonElement | null>,
  spring: { mass: number; stiffness: number; damping: number },
) => {
  const mouseDistance = useTransform(mouseY, (value) => {
    if (typeof value !== "number" || Number.isNaN(value)) return 0;
    const rect = ref.current?.getBoundingClientRect() ?? {
      y: 0,
      height: baseItemSize,
    };
    return value - rect.y - baseItemSize / 2;
  });

  const targetSize = useTransform(
    mouseDistance,
    [-distance, 0, distance],
    [baseItemSize, magnification, baseItemSize],
  );

  return useSpring(targetSize, spring);
};

type DesignResumeDockItem = {
  id: string;
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badgeCount?: number;
};

type DesignResumeDockButtonProps = DesignResumeDockItem & {
  mouseY: MotionValue<number>;
  baseItemSize: number;
  magnification: number;
  distance: number;
  spring: { mass: number; stiffness: number; damping: number };
};

function DesignResumeDockButton({
  icon,
  label,
  active,
  onClick,
  mouseY,
  baseItemSize,
  magnification,
  distance,
  spring,
  badgeCount,
}: DesignResumeDockButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const size = useDockItemSize(
    mouseY,
    baseItemSize,
    magnification,
    distance,
    ref,
    spring,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          ref={ref}
          type="button"
          style={{ width: size, height: size }}
          onClick={onClick}
          className={cn(
            "relative inline-flex cursor-pointer shrink-0 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-md outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            active
              ? "border-primary/50 bg-primary/12 text-primary shadow-primary/20"
              : "border-border/70 hover:border-border hover:bg-accent/70",
          )}
          aria-current={active ? "page" : undefined}
          aria-label={label}
        >
          <span className="[&_svg]:h-5 [&_svg]:w-5">{icon}</span>
          {badgeCount !== undefined && badgeCount > 0 ? (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          ) : null}
        </motion.button>
      </TooltipTrigger>
      <TooltipContent
        side="left"
        sideOffset={12}
        className="border border-border/70 bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-lg"
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

type DesignResumeIconRailProps = {
  activeSectionId: DesignResumeSectionId | null;
  onSectionSelect: (sectionId: DesignResumeSectionId | null) => void;
  className?: string;
};

function DesignResumeDock({
  activeSectionId,
  onSectionSelect,
  className,
}: DesignResumeIconRailProps) {
  const railRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const mouseY = useMotionValue(Number.POSITIVE_INFINITY);
  const spring = { mass: 0.1, stiffness: 150, damping: 12 };
  const panelWidth = 70;
  const magnification = 70;
  const baseItemSize = 46;
  const distance = 200;
  const railPadding = 12;
  const [scrollOffset, setScrollOffset] = useState(0);
  const [railHeight, setRailHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const items = DESIGN_RESUME_ICON_GROUPS.flatMap((group) =>
    group.items.map((item) => {
      const Icon = item.icon;
      const sectionId = item.sectionId === undefined ? item.id : item.sectionId;
      return {
        id: item.id,
        icon: <Icon aria-hidden="true" />,
        label: item.label,
        active: sectionId === activeSectionId,
        onClick: () => onSectionSelect(sectionId),
      };
    }),
  );

  const maxScrollOffset = Math.max(
    0,
    contentHeight + railPadding * 2 - railHeight,
  );

  useEffect(() => {
    const rail = railRef.current;
    const content = contentRef.current;
    if (!rail || !content) return;

    const updateRailHeight = () => setRailHeight(rail.clientHeight);
    const updateContentHeight = () => setContentHeight(content.scrollHeight);
    updateRailHeight();
    updateContentHeight();

    const resizeObserver = new ResizeObserver(() => {
      updateRailHeight();
      updateContentHeight();
    });
    resizeObserver.observe(rail);
    resizeObserver.observe(content);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    setScrollOffset((current) => Math.min(current, maxScrollOffset));
  }, [maxScrollOffset]);

  const handleWheel = (event: React.WheelEvent<HTMLElement>) => {
    if (maxScrollOffset <= 0) return;
    event.preventDefault();
    setScrollOffset((current) =>
      Math.min(Math.max(current + event.deltaY, 0), maxScrollOffset),
    );
  };

  return (
    <div
      style={{ width: panelWidth }}
      className={cn(
        "pointer-events-none z-30 flex items-start justify-end justify-self-end",
        className,
      )}
    >
      <TooltipProvider delayDuration={0} skipDelayDuration={80}>
        <motion.nav
          ref={railRef}
          onMouseMove={({ clientY }) => {
            mouseY.set(clientY);
          }}
          onMouseLeave={() => {
            mouseY.set(Number.POSITIVE_INFINITY);
          }}
          onBlur={() => mouseY.set(Number.POSITIVE_INFINITY)}
          onWheel={handleWheel}
          className="pointer-events-auto relative h-full min-h-0 w-[70px] overflow-hidden overscroll-contain rounded-2xl border border-border/80 bg-card/95 shadow-2xl shadow-background/50 backdrop-blur supports-[backdrop-filter]:bg-card/85"
          role="toolbar"
          aria-label="Resume Studio sections"
        >
          <motion.div
            ref={contentRef}
            className="absolute left-0 right-0 top-3 flex flex-col items-center gap-2"
            style={{ y: -scrollOffset }}
          >
            {items.map((item) => (
              <DesignResumeDockButton
                key={item.id}
                {...item}
                mouseY={mouseY}
                baseItemSize={baseItemSize}
                magnification={magnification}
                distance={distance}
                spring={spring}
              />
            ))}
          </motion.div>
        </motion.nav>
      </TooltipProvider>
    </div>
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

  const activeSectionMeta = activeSection
    ? allDesignResumeSections.find((item) => item.id === activeSection)
    : null;
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

  if (!activeSectionIsValid) {
    return <Navigate to="/design-resume" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        <PageHeader
          icon={PenSquare}
          title="Resume Studio"
          subtitle="Loading your resume"
        />
        <PageMain className={DESIGN_RESUME_PAGE_MAIN_CLASS_NAME}>
          <div className="rounded-2xl border border-border/70 bg-card px-6 py-20 text-center text-sm text-muted-foreground">
            Loading Resume Studio...
          </div>
        </PageMain>
      </div>
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
    <div className="flex h-dvh flex-col overflow-hidden">
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
        title="Resume Studio"
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

      <PageMain className={DESIGN_RESUME_PAGE_MAIN_CLASS_NAME}>
        {!draft ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-border/70 bg-card px-6 py-20 text-center">
            <div className="mx-auto max-w-xl space-y-4">
              <div className="inline-flex rounded-full border border-border/70 bg-muted/20 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Resume Studio
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
                      "Unable to load Resume Studio.",
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div
              className="mb-3 grid h-11 shrink-0 grid-cols-2 rounded-lg bg-muted p-1 text-sm text-muted-foreground sm:hidden"
              role="tablist"
              aria-label="Resume Studio mobile workspace"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mobileWorkspaceView === "edit"}
                className={cn(
                  "inline-flex items-center justify-center rounded-md px-3 font-medium transition-colors",
                  mobileWorkspaceView === "edit"
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:text-foreground",
                )}
                onClick={() => setMobileWorkspaceView("edit")}
              >
                Edit
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mobileWorkspaceView === "preview"}
                className={cn(
                  "inline-flex items-center justify-center rounded-md px-3 font-medium transition-colors",
                  mobileWorkspaceView === "preview"
                    ? "bg-background text-foreground shadow-sm"
                    : "hover:text-foreground",
                )}
                onClick={() => setMobileWorkspaceView("preview")}
              >
                Preview
              </button>
            </div>
            <div
              className={
                activeSection
                  ? "flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden sm:grid sm:grid-rows-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-6 xl:grid-cols-[minmax(442px,0.78fr)_minmax(0,1.22fr)] xl:grid-rows-none"
                  : "flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden sm:grid sm:grid-cols-[70px_minmax(0,1fr)]"
              }
            >
              {activeSection && activeGroup && activeSectionMeta ? (
                <div
                  className={cn(
                    "min-h-0 min-w-0",
                    mobileWorkspaceView === "edit"
                      ? "flex flex-1 flex-col"
                      : "hidden",
                    "sm:grid sm:grid-cols-[70px_minmax(0,1fr)] sm:gap-3",
                  )}
                >
                  <DesignResumeDock
                    activeSectionId={activeSection}
                    className="hidden h-full self-start sm:flex"
                    onSectionSelect={(sectionId) =>
                      navigate(
                        sectionId
                          ? `/design-resume/${sectionId}`
                          : "/design-resume",
                      )
                    }
                  />

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
                    actions={
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 gap-2 sm:hidden"
                        onClick={() => setMobileSectionPickerOpen(true)}
                      >
                        <ListPlus className="h-4 w-4" />
                        Sections
                      </Button>
                    }
                    scrollable
                  >
                    {rail}
                  </SectionWorkspacePanel>
                </div>
              ) : (
                <>
                  <div
                    className={cn(
                      "min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-border/70 bg-card px-6 text-center",
                      mobileWorkspaceView === "edit" ? "flex" : "hidden",
                      "sm:hidden",
                    )}
                  >
                    <div className="max-w-sm space-y-4">
                      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-muted/25 text-muted-foreground">
                        <ListPlus className="h-5 w-5" />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-semibold tracking-tight">
                          Choose a section to edit
                        </h2>
                        <p className="text-sm leading-6 text-muted-foreground">
                          Pick a resume section, then edit it full-screen while
                          the preview stays one tap away.
                        </p>
                      </div>
                      <Button
                        type="button"
                        onClick={() => setMobileSectionPickerOpen(true)}
                      >
                        <ListPlus className="mr-2 h-4 w-4" />
                        Choose section
                      </Button>
                    </div>
                  </div>
                  <DesignResumeDock
                    activeSectionId={null}
                    className="hidden h-full self-start sm:flex"
                    onSectionSelect={(sectionId) =>
                      navigate(
                        sectionId
                          ? `/design-resume/${sectionId}`
                          : "/design-resume",
                      )
                    }
                  />
                </>
              )}

              <DesignResumePreviewPanel
                className={cn(
                  mobileWorkspaceView === "preview" ? "flex flex-1" : "hidden",
                  "sm:flex",
                )}
                draft={draft}
                pdfRenderer={pdfRenderer}
                typstTheme={typstTheme}
                isUpdatingRenderer={rendererUpdating || settingsLoading}
                isDirty={dirty}
                saveState={saveState}
                onPdfRendererChange={handlePdfRendererChange}
                onTypstThemeChange={handleTypstThemeChange}
              />
            </div>
          </>
        )}
      </PageMain>

      {draft ? (
        <Sheet
          open={mobileSectionPickerOpen}
          onOpenChange={setMobileSectionPickerOpen}
        >
          <SheetContent
            side="bottom"
            className="flex max-h-[86dvh] flex-col overflow-hidden p-0 sm:hidden"
          >
            <SheetHeader className="shrink-0 border-b border-border/70 px-5 py-4 text-left">
              <SheetTitle>Choose section</SheetTitle>
              <SheetDescription>
                Switch the mobile editor to a resume section.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              <div className="space-y-4">
                {DESIGN_RESUME_NAV_GROUPS.map((group) => (
                  <section key={group.id} className="space-y-2">
                    <div className="px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                      {group.label}
                    </div>
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const Icon = getDesignResumeSectionIcon(item.id);
                        const isActive = activeSection === item.id;
                        const badge = getDesignResumeSectionBadge(item.id);

                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-current={isActive ? "page" : undefined}
                            className={cn(
                              "flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                              isActive
                                ? "border-primary/45 bg-primary/12 text-foreground"
                                : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-accent/45 hover:text-foreground",
                            )}
                            onClick={() => handleMobileSectionSelect(item.id)}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/70">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {item.label}
                              </span>
                              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                {item.description}
                              </span>
                            </span>
                            {badge ? (
                              <span className="shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                                {badge.label}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

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
            const currentItems = asArray(
              asRecord(
                asRecord(draft.resumeJson.sections)?.[
                  dialogState.definition.key
                ],
              )?.items,
            );
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
            trackProductEvent("resume_studio_section_edited", {
              section: dialogState.definition.key,
              action: dialogState.index == null ? "add" : "edit",
              item_count_bucket: bucketCount(
                dialogState.index == null
                  ? currentItems.length + 1
                  : currentItems.length,
              ),
              device_layout: getDeviceLayout(),
            });
          }}
          onDelete={
            dialogState.index == null
              ? undefined
              : () => {
                  const currentItems = asArray(
                    asRecord(
                      asRecord(draft.resumeJson.sections)?.[
                        dialogState.definition.key
                      ],
                    )?.items,
                  );
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
                  trackProductEvent("resume_studio_section_edited", {
                    section: dialogState.definition.key,
                    action: "delete",
                    item_count_bucket: bucketCount(
                      Math.max(0, currentItems.length - 1),
                    ),
                    device_layout: getDeviceLayout(),
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
              This will replace your current Resume Studio with the latest data
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
    </div>
  );
};
