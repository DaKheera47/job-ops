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
    <div className="hidden lg:flex fixed bottom-0 inset-x-0 z-40 items-center justify-center border-t border-border/40 bg-background/80 backdrop-blur-sm px-4 py-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-muted-foreground">
        {groupOrder.map((group) => {
          const defs = grouped[group];
          if (defs.length === 0) return null;
          const deduped = dedupeShortcuts(defs);
          return (
            <span key={group} className="flex items-center gap-1.5">
              <span className="font-medium text-muted-foreground/70">
                {groupLabel[group]}:
              </span>
              {deduped.map((item) => (
                <span
                  key={item.label}
                  className="inline-flex items-center gap-1"
                >
                  {item.displayKeys.map((dk) => (
                    <kbd
                      key={dk}
                      className="inline-flex items-center justify-center min-w-[1.2rem] h-[1.15rem] px-1 rounded border border-border/60 bg-muted/40 text-[10px] font-mono font-medium leading-none"
                    >
                      {dk}
                    </kbd>
                  ))}
                  <span>{item.label}</span>
                </span>
              ))}
            </span>
          );
        })}
      </div>
    </div>
  );
};
