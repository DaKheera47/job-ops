/**
 * KeyboardShortcutBar - Superhuman-style bottom hint bar showing available
 * keyboard shortcuts for the current tab context.
 *
 * Only visible on desktop (lg+) when the Control key is held down.
 */

import { useModifierPressed } from "@client/hooks/useModifierPressed";
import {
  dedupeShortcuts,
  getShortcutsForTab,
  groupShortcuts,
  type ShortcutGroup,
} from "@client/lib/shortcut-map";
import type { FilterTab } from "@client/pages/orchestrator/constants";
import type React from "react";

const groupLabel: Record<ShortcutGroup, string> = {
  navigation: "Navigate",
  tabs: "Tabs",
  actions: "Actions",
  meta: "General",
};

const groupOrder: ShortcutGroup[] = ["navigation", "actions", "tabs", "meta"];

interface KeyboardShortcutBarProps {
  activeTab: FilterTab;
}

export const KeyboardShortcutBar: React.FC<KeyboardShortcutBarProps> = ({
  activeTab,
}) => {
  const isControlPressed = useModifierPressed("Control");

  if (!isControlPressed) return null;

  const all = getShortcutsForTab(activeTab);
  const grouped = groupShortcuts(all);

  return (
    <div className="hidden lg:flex fixed bottom-0 inset-x-0 z-40 items-center justify-center border-t border-border/40 bg-background/90 backdrop-blur-md px-4 py-4 animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex flex-col gap-3 text-[12px] text-muted-foreground max-w-4xl w-full">
        {groupOrder.map((group) => {
          const defs = grouped[group];
          if (defs.length === 0) return null;
          const deduped = dedupeShortcuts(defs);
          return (
            <div key={group} className="flex items-center gap-4">
              <span className="font-bold text-muted-foreground/90 uppercase tracking-wider text-[10px] w-20 shrink-0">
                {groupLabel[group]}
              </span>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {deduped.map((item) => (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2"
                  >
                    <div className="flex gap-1">
                      {item.displayKeys.map((dk) => (
                        <kbd
                          key={dk}
                          className="inline-flex items-center justify-center min-w-[1.4rem] h-[1.3rem] px-1.5 rounded border border-border/80 bg-muted/60 text-[11px] font-mono font-bold leading-none text-foreground shadow-sm"
                        >
                          {dk}
                        </kbd>
                      ))}
                    </div>
                    <span className="text-muted-foreground/80">
                      {item.label}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
