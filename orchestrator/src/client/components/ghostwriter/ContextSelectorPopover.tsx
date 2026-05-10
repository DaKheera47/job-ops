import type { LucideIcon } from "lucide-react";
import { ChevronDown, Info } from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type ContextSelectorPopoverProps<TItem> = {
  items: TItem[];
  selectedIds: string[];
  icon: LucideIcon;
  defaultTriggerLabel: string;
  selectedTriggerLabel: (selectedCount: number) => string;
  headerLabel: string;
  loadingLabel: string;
  emptyLabel: string;
  limitLabel: string;
  overflowLabel: string;
  maxSelected: number;
  maxItemChars: number;
  maxTotalChars: number;
  disabled?: boolean;
  isLoading?: boolean;
  isSaving?: boolean;
  popoverClassName?: string;
  getId: (item: TItem) => string;
  getTitle: (item: TItem) => string;
  getMeta: (item: TItem) => string;
  getContentLength: (item: TItem) => number;
  getCheckboxId: (item: TItem) => string;
  onChange: (selectedIds: string[]) => void;
};

function getSelectedItems<TItem>(
  items: TItem[],
  selectedIds: string[],
  getId: (item: TItem) => string,
) {
  const itemsById = new Map(items.map((item) => [getId(item), item]));
  return selectedIds
    .map((itemId) => itemsById.get(itemId))
    .filter((item): item is TItem => Boolean(item));
}

export function ContextSelectorPopover<TItem>({
  items,
  selectedIds,
  icon: Icon,
  defaultTriggerLabel,
  selectedTriggerLabel,
  headerLabel,
  loadingLabel,
  emptyLabel,
  limitLabel,
  overflowLabel,
  maxSelected,
  maxItemChars,
  maxTotalChars,
  disabled,
  isLoading,
  isSaving,
  popoverClassName = "w-80",
  getId,
  getTitle,
  getMeta,
  getContentLength,
  getCheckboxId,
  onChange,
}: ContextSelectorPopoverProps<TItem>) {
  const selectedItems = getSelectedItems(items, selectedIds, getId);
  const selectedContentChars = selectedItems.reduce(
    (total, item) => total + Math.min(getContentLength(item), maxItemChars),
    0,
  );
  const hasTotalOverflow = selectedContentChars > maxTotalChars;
  const isAtSelectionLimit = selectedIds.length >= maxSelected;

  const toggleItem = (itemId: string) => {
    if (disabled || isLoading || isSaving) return;
    if (selectedIds.includes(itemId)) {
      onChange(selectedIds.filter((id) => id !== itemId));
      return;
    }
    if (isAtSelectionLimit) return;
    onChange([...selectedIds, itemId]);
  };

  const triggerLabel =
    selectedIds.length > 0
      ? selectedTriggerLabel(selectedIds.length)
      : defaultTriggerLabel;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-8 gap-1.5 px-2.5 text-xs",
            selectedIds.length > 0 && "border-primary/40 bg-primary/5",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{isSaving ? "Saving..." : triggerLabel}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className={cn(popoverClassName, "p-0")}>
        <div className="border-b px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium">{headerLabel}</div>
            {selectedIds.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                {selectedIds.length}/{maxSelected}
              </Badge>
            )}
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto py-1">
          {isLoading ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              {loadingLabel}
            </div>
          ) : items.length === 0 ? (
            <div className="px-3 py-6 text-sm text-muted-foreground">
              {emptyLabel}
            </div>
          ) : (
            items.map((item) => {
              const itemId = getId(item);
              const isSelected = selectedIds.includes(itemId);
              const isTrimmed = getContentLength(item) > maxItemChars;
              const isUnavailable = !isSelected && isAtSelectionLimit;
              const checkboxId = getCheckboxId(item);

              return (
                <div
                  key={itemId}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50",
                    isSelected && "bg-primary/5",
                    isUnavailable && "cursor-not-allowed opacity-55",
                  )}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={isSelected}
                    disabled={
                      disabled || isLoading || isSaving || isUnavailable
                    }
                    className="mt-0.5"
                    onCheckedChange={() => toggleItem(itemId)}
                  />
                  <label
                    htmlFor={checkboxId}
                    className={cn(
                      "min-w-0 flex-1 cursor-pointer",
                      (disabled || isLoading || isSaving || isUnavailable) &&
                        "cursor-not-allowed",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-medium">
                        {getTitle(item)}
                      </span>
                      {isSelected && isTrimmed && (
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px]"
                        >
                          Trimmed for AI
                        </Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {getMeta(item)}
                    </span>
                  </label>
                </div>
              );
            })
          )}
        </div>

        {(isAtSelectionLimit || hasTotalOverflow) && (
          <div className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {isAtSelectionLimit && (
              <div className="flex items-center gap-1.5">
                <Info className="h-3 w-3" />
                <span>{limitLabel}</span>
              </div>
            )}
            {hasTotalOverflow && (
              <div className="mt-1 flex items-start gap-1.5">
                <Info className="mt-0.5 h-3 w-3" />
                <span>{overflowLabel}</span>
              </div>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
