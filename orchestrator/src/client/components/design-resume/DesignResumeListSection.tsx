import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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
import { DesignResumeSection } from "./DesignResumeSection";
import type { ItemDefinition } from "./definitions";
import { getByPath, toBoolean, toText } from "./utils";

type DesignResumeListSectionProps = {
  definition: ItemDefinition;
  items: Record<string, unknown>[];
  onAdd: () => void;
  onEdit: (index: number) => void;
  onUpdateItems: (nextItems: Record<string, unknown>[]) => void;
};

export function DesignResumeListSection({
  definition,
  items,
  onAdd,
  onEdit,
  onUpdateItems,
}: DesignResumeListSectionProps) {
  const [pendingRemovalIndex, setPendingRemovalIndex] = useState<number | null>(
    null,
  );
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

  return (
    <DesignResumeSection
      value={definition.key}
      title={definition.title}
      subtitle={definition.description}
      badge={items.length === 0 ? "Empty" : `${items.length}`}
    >
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
          items.map((item, index) => (
            <div
              key={toText(item.id, `${definition.key}-${index}`)}
              className="rounded-lg border border-border/60 bg-background/60 px-4 py-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">
                    {toText(
                      getByPath(item, definition.primaryField),
                      "Untitled",
                    )}
                  </div>
                  {definition.secondaryField ? (
                    <div className="text-xs text-muted-foreground">
                      {toText(getByPath(item, definition.secondaryField))}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  {toBoolean(item.hidden, false) ? "Hidden" : "Visible"}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onEdit(index)}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const nextItems = [...items];
                    nextItems[index] = {
                      ...nextItems[index],
                      hidden: !toBoolean(nextItems[index].hidden, false),
                    };
                    onUpdateItems(nextItems);
                  }}
                >
                  {toBoolean(item.hidden, false) ? "Show" : "Hide"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (index === 0) return;
                    const nextItems = [...items];
                    const [currentItem] = nextItems.splice(index, 1);
                    nextItems.splice(index - 1, 0, currentItem);
                    onUpdateItems(nextItems);
                  }}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    if (index === items.length - 1) return;
                    const nextItems = [...items];
                    const [currentItem] = nextItems.splice(index, 1);
                    nextItems.splice(index + 1, 0, currentItem);
                    onUpdateItems(nextItems);
                  }}
                >
                  Down
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
                  onClick={() => setPendingRemovalIndex(index)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))
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
    </DesignResumeSection>
  );
}
