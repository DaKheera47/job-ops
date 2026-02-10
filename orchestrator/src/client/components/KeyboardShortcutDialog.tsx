/**
 * KeyboardShortcutDialog - Help dialog triggered by the "?" shortcut.
 *
 * Displays all available keyboard shortcuts grouped by category,
 * rendered as a clean three-column layout.
 */

import {
  dedupeShortcuts,
  getShortcutsForTab,
  groupShortcuts,
  type ShortcutGroup,
} from "@client/lib/shortcut-map";
import type { FilterTab } from "@client/pages/orchestrator/constants";
import type React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const groupLabel: Record<ShortcutGroup, string> = {
  navigation: "Navigation",
  tabs: "Tabs",
  actions: "Actions",
  meta: "General",
};

const groupOrder: ShortcutGroup[] = ["navigation", "actions", "tabs", "meta"];

interface KeyboardShortcutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: FilterTab;
}

export const KeyboardShortcutDialog: React.FC<KeyboardShortcutDialogProps> = ({
  open,
  onOpenChange,
  activeTab,
}) => {
  const all = getShortcutsForTab(activeTab);
  const grouped = groupShortcuts(all);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Available shortcuts for the current view. Press{" "}
            <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded border border-border/60 bg-muted/40 text-[10px] font-mono font-medium leading-none">
              ?
            </kbd>{" "}
            to toggle this dialog.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2 pt-2">
          {groupOrder.map((group) => {
            const defs = grouped[group];
            if (defs.length === 0) return null;
            const deduped = dedupeShortcuts(defs);
            return (
              <div key={group}>
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {groupLabel[group]}
                </div>
                <div className="space-y-1.5">
                  {deduped.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-muted-foreground">
                        {item.label}
                      </span>
                      <span className="flex items-center gap-1 ml-3">
                        {item.displayKeys.map((dk, i) => (
                          <span key={dk} className="flex items-center gap-1">
                            {i > 0 && (
                              <span className="text-muted-foreground/40 text-[10px]">
                                /
                              </span>
                            )}
                            <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded border border-border/60 bg-muted/40 text-[10px] font-mono font-medium leading-none">
                              {dk}
                            </kbd>
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
