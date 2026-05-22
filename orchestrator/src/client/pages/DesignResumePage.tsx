import {
  DESIGN_RESUME_NAV_GROUPS,
  DESIGN_RESUME_PAGE_MAIN_CLASS_NAME,
  getDesignResumeSectionIcon,
  getDeviceLayout,
} from "@client/components/design-resume/constants";
import { DesignResumeDock } from "@client/components/design-resume/DesignResumeDock";
import { DesignResumePreviewPanel } from "@client/components/design-resume/DesignResumePreviewPanel";
import { DesignResumeRail } from "@client/components/design-resume/DesignResumeRail";
import { ItemDialog } from "@client/components/design-resume/ItemDialog";
import {
  asArray,
  asRecord,
  getByPath,
  getDesignResumeDialogItem,
  toText,
} from "@client/components/design-resume/utils";
import { PageHeader, PageMain } from "@client/components/layout";
import { SectionWorkspacePanel } from "@client/components/section-workspace/SectionWorkspace";
import { useDesignResumeStudio } from "@client/hooks/useDesignResumeStudio";
import type { DesignResumeJson } from "@shared/types";
import {
  Download,
  FileDown,
  Import,
  ListPlus,
  MoreHorizontal,
  PenSquare,
} from "lucide-react";
import type React from "react";
import { Navigate, useNavigate } from "react-router-dom";
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
import { bucketCount, trackProductEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { formatUserFacingError } from "../lib/error-format";

export const DesignResumePage: React.FC = () => {
  const navigate = useNavigate();
  const {
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
  } = useDesignResumeStudio();

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
                  : "flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden sm:grid sm:grid-cols-[76px_minmax(0,1fr)]"
              }
            >
              {activeSection && activeGroup && activeSectionMeta ? (
                <div
                  className={cn(
                    "min-h-0 min-w-0",
                    mobileWorkspaceView === "edit"
                      ? "flex flex-1 flex-col"
                      : "hidden",
                    "sm:grid sm:grid-cols-[76px_minmax(0,1fr)] sm:gap-3",
                  )}
                >
                  <DesignResumeDock
                    activeSectionId={activeSection}
                    className="hidden h-full self-start sm:flex"
                    draft={draft}
                    onUpdateResumeJson={updateResumeJson}
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
                    draft={draft}
                    onUpdateResumeJson={updateResumeJson}
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
