import {
  ArrowDown,
  ArrowUp,
  Eye,
  EyeOff,
  GripVertical,
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
};

export function DesignResumeListSectionContent({
  definition,
  items,
  onAdd,
  onEdit,
  onUpdateItems,
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
              Add entries, reorder them, or hide the ones you do not want to
              show.
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
              const isHidden = toBoolean(item.hidden, false);
              const primaryLabel = toText(
                getByPath(item, definition.primaryField),
                "Untitled",
              );
              const secondaryLabel = getItemPreview(item, definition);
              return (
                <li
                  key={toText(item.id, `${definition.key}-${index}`)}
                  ref={(element) => {
                    cardRefs.current[index] = element;
                  }}
                  className={cn(
                    "group rounded-xl border border-border/60 bg-background/60 px-4 py-4 shadow-sm transition-[border-color,background-color,opacity] hover:border-border focus-within:opacity-100",
                    isHidden && "opacity-55 hover:opacity-100",
                    draggingIndex === index && "opacity-55",
                    dragOverIndex === index &&
                      draggingIndex !== index &&
                      "border-primary/50 bg-primary/5",
                  )}
                  onDragOver={(event) => {
                    if (draggingIndex == null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDragOverIndex(index);
                  }}
                  onDrop={(event) => handleDrop(event, index)}
                >
                  <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3">
                    <button
                      type="button"
                      draggable
                      aria-label={`Drag ${primaryLabel} to reorder`}
                      className="flex h-9 w-6 cursor-grab touch-none items-center justify-center rounded-md pt-1 text-muted-foreground/70 transition-colors hover:bg-accent/50 hover:text-foreground active:cursor-grabbing"
                      onDragStart={(event) => handleDragStart(event, index)}
                      onDragEnd={resetDragState}
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
                        <button
                          type="button"
                          className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors ${
                            isHidden
                              ? "border-border/70 bg-muted/20 text-muted-foreground hover:bg-muted/30"
                              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
                          }`}
                          onClick={() => {
                            const nextItems = [...items];
                            nextItems[index] = {
                              ...nextItems[index],
                              hidden: !isHidden,
                            };
                            onUpdateItems(nextItems);
                          }}
                        >
                          {isHidden ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          {isHidden ? "Hidden" : "Visible"}
                        </button>
                      </div>

                      <div className="mt-4 border-t border-border/50 pt-3">
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <Button
                            type="button"
                            variant="ghost"
                            className={itemActionClassName}
                            onClick={() => onEdit(index)}
                          >
                            <Pencil className="h-4 w-4 text-blue-400" />
                            <span className={itemActionLabelClassName}>
                              Edit
                            </span>
                          </Button>
                          <div className="h-5 w-px bg-border/70" />
                          <Button
                            type="button"
                            variant="ghost"
                            className={itemActionClassName}
                            onClick={() => {
                              const nextItems = [...items];
                              nextItems[index] = {
                                ...nextItems[index],
                                hidden: !isHidden,
                              };
                              onUpdateItems(nextItems);
                            }}
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
                          <div className="h-5 w-px bg-border/70" />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            disabled={index === 0}
                            aria-label={`Move ${primaryLabel} up`}
                            title="Move up"
                            onClick={() => {
                              if (index === 0) return;
                              const nextItems = [...items];
                              const [currentItem] = nextItems.splice(index, 1);
                              nextItems.splice(index - 1, 0, currentItem);
                              onUpdateItems(nextItems);
                            }}
                          >
                            <ArrowUp className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                            disabled={index === items.length - 1}
                            aria-label={`Move ${primaryLabel} down`}
                            title="Move down"
                            onClick={() => {
                              if (index === items.length - 1) return;
                              const nextItems = [...items];
                              const [currentItem] = nextItems.splice(index, 1);
                              nextItems.splice(index + 1, 0, currentItem);
                              onUpdateItems(nextItems);
                            }}
                          >
                            <ArrowDown className="h-4 w-4" />
                          </Button>
                          <div className="h-5 w-px bg-border/70" />
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 gap-2 rounded-md px-2 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 2xl:px-3"
                            onClick={() => setPendingRemovalIndex(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className={itemActionLabelClassName}>
                              Remove
                            </span>
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
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
              This will remove {pendingRemovalLabel} from your Design Resume.
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
