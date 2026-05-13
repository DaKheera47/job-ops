import {
  Bot,
  Eye,
  EyeOff,
  GripVertical,
  LockKeyhole,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import type { DragEvent } from "react";
import { useMemo, useRef, useState } from "react";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DesignResumeSection } from "./DesignResumeSection";
import type { ItemDefinition } from "./definitions";
import { getByPath, toBoolean, toText } from "./utils";

const itemActionClassName =
  "h-8 gap-2 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground 2xl:px-3";
const itemActionLabelClassName = "xl:hidden 2xl:inline";

function reorderItems<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return items;
  const nextItems = [...items];
  const [currentItem] = nextItems.splice(fromIndex, 1);
  if (!currentItem) return items;
  nextItems.splice(toIndex, 0, currentItem);
  return nextItems;
}

function getItemPreview(
  item: Record<string, unknown>,
  definition: ItemDefinition,
): string {
  const secondaryValue = definition.secondaryField
    ? toText(getByPath(item, definition.secondaryField))
    : "";
  if (secondaryValue) return secondaryValue;

  const tagField = definition.fields.find((field) => field.type === "tags");
  if (!tagField) return "";

  const value = getByPath(item, tagField.key);
  if (!Array.isArray(value)) return "";

  return value
    .map((entry) => toText(entry))
    .filter(Boolean)
    .join(", ");
}

type DesignResumeListSectionProps = {
  definition: ItemDefinition;
  items: Record<string, unknown>[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onUpdateItems: (nextItems: Record<string, unknown>[]) => void;
  projectPolicy?: ProjectPolicyConfig;
};

type DesignResumeListItemCardProps = {
  definition: ItemDefinition;
  item: Record<string, unknown>;
  index: number;
  isDragging: boolean;
  isDragTarget: boolean;
  cardRef: (element: HTMLLIElement | null) => void;
  onEdit: (index: number) => void;
  onToggleHidden: (index: number) => void;
  onRemove: (index: number) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, index: number) => void;
  onDragEnd: () => void;
  onDragOver: (event: DragEvent<HTMLLIElement>, index: number) => void;
  onDrop: (event: DragEvent<HTMLElement>, index: number) => void;
  onProjectModeChange: (
    index: number,
    projectId: string,
    mode: ProjectTailoringMode,
  ) => void;
  projectPolicy?: ProjectPolicyConfig;
};

export type ProjectTailoringMode = "manual" | "ai-selectable" | "must-include";

export type ProjectPolicyConfig = {
  getMode: (projectId: string) => ProjectTailoringMode;
  onModeChange: (projectId: string, mode: ProjectTailoringMode) => void;
  disabled?: boolean;
  isSaving?: boolean;
};

const projectModeOptions: Array<{
  mode: ProjectTailoringMode;
  label: string;
  shortLabel: string;
  tooltip: string;
  icon: typeof EyeOff;
  activeClassName: string;
}> = [
  {
    mode: "manual",
    label: "Don't select",
    shortLabel: "Don't select",
    tooltip:
      "Do not select this project, meaning it'll never show in tailored resumes",
    icon: EyeOff,
    activeClassName: "border-border/70 bg-muted/55 text-muted-foreground",
  },
  {
    mode: "ai-selectable",
    label: "AI can select",
    shortLabel: "AI can select",
    tooltip: "Let Job Tailoring select it when relevant to the job description",
    icon: Bot,
    activeClassName: "border-sky-400/35 bg-sky-500/12 text-sky-300",
  },
  {
    mode: "must-include",
    label: "Always selected",
    shortLabel: "Always",
    tooltip:
      "Always include this project in tailored resumes, regardless of the job description",
    icon: LockKeyhole,
    activeClassName: "border-amber-200/35 bg-amber-300/12 text-amber-200",
  },
];

function ProjectTailoringModeControls({
  projectName,
  disabled,
  isSaving,
  onModeChange,
  selectedMode,
}: {
  projectName: string;
  disabled?: boolean;
  isSaving?: boolean;
  onModeChange: (mode: ProjectTailoringMode) => void;
  selectedMode: ProjectTailoringMode;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <TooltipProvider delayDuration={150}>
        <div className="flex max-w-full flex-wrap gap-1.5">
          {projectModeOptions.map((option) => {
            const Icon = option.icon;
            const active = selectedMode === option.mode;

            return (
              <Tooltip key={option.mode}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={active}
                    aria-label={`Set ${projectName} inclusion to ${option.label}`}
                    disabled={disabled}
                    className={cn(
                      "inline-flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                      active
                        ? option.activeClassName
                        : "border-border/45 bg-background/35 text-muted-foreground hover:border-border/70 hover:bg-accent/45 hover:text-foreground",
                    )}
                    onClick={() => onModeChange(option.mode)}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span>{option.shortLabel}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-60 text-center" side="top">
                  {option.tooltip}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
      <div className="min-h-4">
        {isSaving ? (
          <span className="text-[11px] text-muted-foreground">Saving...</span>
        ) : null}
      </div>
    </div>
  );
}

function DesignResumeListItemCard({
  definition,
  item,
  index,
  isDragging,
  isDragTarget,
  cardRef,
  onEdit,
  onToggleHidden,
  onRemove,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onProjectModeChange,
  projectPolicy,
}: DesignResumeListItemCardProps) {
  const isHidden = toBoolean(item.hidden, false);
  const primaryLabel = toText(
    getByPath(item, definition.primaryField),
    "Untitled",
  );
  const secondaryLabel = getItemPreview(item, definition);
  const itemId = toText(item.id);
  const canShowProjectPolicy =
    definition.key === "projects" && projectPolicy && itemId;
  const projectSettingsMode =
    canShowProjectPolicy && projectPolicy
      ? projectPolicy.getMode(itemId)
      : null;
  const projectSelectedMode: ProjectTailoringMode | null =
    projectSettingsMode === "must-include"
      ? "must-include"
      : projectSettingsMode === "ai-selectable"
        ? "ai-selectable"
        : isHidden
          ? "manual"
          : "must-include";
  const shouldDimCard =
    isHidden &&
    (definition.key !== "projects" || projectSelectedMode === "manual");
  const showVisibilityPill = definition.key !== "projects";
  const showHideAction = definition.key !== "projects";

  return (
    <li
      ref={cardRef}
      className={cn(
        "group rounded-xl border border-border/60 bg-background/60 px-4 py-4 shadow-sm transition-[border-color,background-color,opacity] hover:border-border focus-within:opacity-100",
        shouldDimCard && "opacity-55 hover:opacity-100",
        isDragging && "opacity-55",
        isDragTarget && "border-primary/50 bg-primary/5",
      )}
      onDragOver={(event) => onDragOver(event, index)}
      onDrop={(event) => onDrop(event, index)}
    >
      <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
        <button
          type="button"
          draggable
          aria-label={`Drag ${primaryLabel} to reorder`}
          className="flex h-9 w-6 cursor-grab touch-none items-center justify-center rounded-md pt-1 text-muted-foreground/70 transition-colors hover:bg-accent/50 hover:text-foreground active:cursor-grabbing"
          onDragStart={(event) => onDragStart(event, index)}
          onDragEnd={onDragEnd}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-foreground">
                {primaryLabel}
              </div>
              {secondaryLabel ? (
                <div className="mt-1 truncate text-sm text-muted-foreground">
                  {secondaryLabel}
                </div>
              ) : null}
            </div>
            {showVisibilityPill ? (
              <button
                type="button"
                className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ${
                  isHidden
                    ? "border-border/70 bg-muted/20 text-muted-foreground hover:bg-muted/30"
                    : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                }`}
                onClick={() => onToggleHidden(index)}
              >
                {isHidden ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                {isHidden ? "Hidden" : "Visible"}
              </button>
            ) : null}
          </div>

          {canShowProjectPolicy && projectSelectedMode ? (
            <ProjectTailoringModeControls
              projectName={primaryLabel}
              disabled={projectPolicy.disabled}
              isSaving={projectPolicy.isSaving}
              onModeChange={(mode) => onProjectModeChange(index, itemId, mode)}
              selectedMode={projectSelectedMode}
            />
          ) : null}

          <div className="mt-4 border-t border-border/50 pt-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Button
                type="button"
                variant="ghost"
                className={itemActionClassName}
                onClick={() => onEdit(index)}
              >
                <Pencil className="h-4 w-4 text-blue-400" />
                <span className={itemActionLabelClassName}>Edit</span>
              </Button>
              {showHideAction ? (
                <>
                  <div className="h-5 w-px bg-border/70" />
                  <Button
                    type="button"
                    variant="ghost"
                    className={itemActionClassName}
                    onClick={() => onToggleHidden(index)}
                  >
                    {isHidden ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                    <span className={itemActionLabelClassName}>
                      {isHidden ? "Show" : "Hide"}
                    </span>
                  </Button>
                </>
              ) : null}
              <div className="h-5 w-px bg-border/70" />
              <Button
                type="button"
                variant="ghost"
                className="h-8 gap-2 rounded-md px-2 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 2xl:px-3"
                onClick={() => onRemove(index)}
              >
                <Trash2 className="h-4 w-4" />
                <span className={itemActionLabelClassName}>Remove</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function DesignResumeListSectionContent({
  definition,
  items,
  onAdd,
  onEdit,
  onUpdateItems,
  projectPolicy,
}: DesignResumeListSectionProps) {
  const [pendingRemovalIndex, setPendingRemovalIndex] = useState<number | null>(
    null,
  );
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const cardRefs = useRef<Array<HTMLLIElement | null>>([]);
  const pendingRemovalItem = useMemo(
    () =>
      pendingRemovalIndex == null ? null : (items[pendingRemovalIndex] ?? null),
    [items, pendingRemovalIndex],
  );
  const pendingRemovalLabel = toText(
    pendingRemovalItem
      ? getByPath(pendingRemovalItem, definition.primaryField)
      : null,
    "this item",
  );

  const confirmRemoval = () => {
    if (pendingRemovalIndex == null) return;
    onUpdateItems(
      items.filter((_, currentIndex) => currentIndex !== pendingRemovalIndex),
    );
    setPendingRemovalIndex(null);
  };

  const toggleItemHidden = (index: number) => {
    const nextItems = [...items];
    nextItems[index] = {
      ...nextItems[index],
      hidden: !toBoolean(nextItems[index].hidden, false),
    };
    onUpdateItems(nextItems);
  };

  const updateProjectInclusionMode = (
    index: number,
    projectId: string,
    mode: ProjectTailoringMode,
  ) => {
    if (!projectPolicy) return;
    const nextItems = [...items];
    nextItems[index] = {
      ...nextItems[index],
      hidden: mode !== "must-include",
    };
    onUpdateItems(nextItems);
    projectPolicy.onModeChange(projectId, mode);
  };

  const resetDragState = () => {
    setDraggingIndex(null);
    setDragOverIndex(null);
  };

  const handleDragStart = (
    event: DragEvent<HTMLButtonElement>,
    index: number,
  ) => {
    setDraggingIndex(index);
    setDragOverIndex(index);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));

    const card = cardRefs.current[index];
    if (card) {
      event.dataTransfer.setDragImage(card, 24, 24);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    const rawIndex = event.dataTransfer.getData("text/plain");
    const fromIndex =
      draggingIndex ?? (rawIndex ? Number.parseInt(rawIndex, 10) : Number.NaN);

    if (
      Number.isNaN(fromIndex) ||
      fromIndex < 0 ||
      fromIndex >= items.length ||
      fromIndex === index
    ) {
      resetDragState();
      return;
    }

    onUpdateItems(reorderItems(items, fromIndex, index));
    resetDragState();
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <div>
            <div className="text-sm font-medium text-foreground">
              {items.length} item{items.length === 1 ? "" : "s"}
            </div>
            <div className="text-xs text-muted-foreground">
              {definition.key === "projects"
                ? "Add entries, reorder them, or choose when each one appears."
                : "Add entries, reorder them, or hide the ones you do not want to show."}
            </div>
          </div>
          <Button type="button" variant="outline" onClick={onAdd}>
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
            No items yet.
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item, index) => {
              return (
                <DesignResumeListItemCard
                  key={toText(item.id, `${definition.key}-${index}`)}
                  definition={definition}
                  item={item}
                  index={index}
                  isDragging={draggingIndex === index}
                  isDragTarget={
                    dragOverIndex === index && draggingIndex !== index
                  }
                  cardRef={(element) => {
                    cardRefs.current[index] = element;
                  }}
                  onEdit={onEdit}
                  onToggleHidden={toggleItemHidden}
                  onRemove={setPendingRemovalIndex}
                  onDragStart={handleDragStart}
                  onDragEnd={resetDragState}
                  onDragOver={(event, dragOverIndex) => {
                    if (draggingIndex == null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverIndex(dragOverIndex);
                  }}
                  onDrop={handleDrop}
                  onProjectModeChange={updateProjectInclusionMode}
                  projectPolicy={projectPolicy}
                />
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog
        open={pendingRemovalIndex != null}
        onOpenChange={(open) => {
          if (!open) setPendingRemovalIndex(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {definition.singularTitle.toLowerCase()}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {pendingRemovalLabel} from your Resume Studio.
              You can add it again later, but this change will be saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmRemoval}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function DesignResumeListSection(props: DesignResumeListSectionProps) {
  return (
    <DesignResumeSection
      value={props.definition.key}
      title={props.definition.title}
      subtitle={props.definition.description}
      badge={props.items.length === 0 ? "Empty" : `${props.items.length}`}
    >
      <DesignResumeListSectionContent {...props} />
    </DesignResumeSection>
  );
}
