import type { FilterTab } from "@client/pages/orchestrator/constants";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ShortcutGroup = "navigation" | "actions" | "tabs" | "meta";

export interface ShortcutDef {
  /** tinykeys key descriptor, e.g. "j", "Shift+S", "$mod+K" */
  key: string;
  /** Human-readable key label shown in the UI, e.g. "j", "Shift+S", "Cmd+K" */
  displayKey: string;
  /** Short description shown in hints/help */
  label: string;
  /** Grouping for the help dialog */
  group: ShortcutGroup;
  /** Tabs where the shortcut is active. undefined = all tabs. */
  scope?: FilterTab[];
}

// ─── Definitions ─────────────────────────────────────────────────────────────

export const SHORTCUTS = {
  // Navigation
  nextJob: {
    key: "j",
    displayKey: "j",
    label: "Next job",
    group: "navigation",
  },
  nextJobArrow: {
    key: "ArrowDown",
    displayKey: "\u2193",
    label: "Next job",
    group: "navigation",
  },
  prevJob: {
    key: "k",
    displayKey: "k",
    label: "Previous job",
    group: "navigation",
  },
  prevJobArrow: {
    key: "ArrowUp",
    displayKey: "\u2191",
    label: "Previous job",
    group: "navigation",
  },

  // Tabs
  tabReady: {
    key: "1",
    displayKey: "1",
    label: "Ready tab",
    group: "tabs",
  },
  tabDiscovered: {
    key: "2",
    displayKey: "2",
    label: "Discovered tab",
    group: "tabs",
  },
  tabApplied: {
    key: "3",
    displayKey: "3",
    label: "Applied tab",
    group: "tabs",
  },
  tabAll: {
    key: "4",
    displayKey: "4",
    label: "All Jobs tab",
    group: "tabs",
  },
  prevTabArrow: {
    key: "ArrowLeft",
    displayKey: "\u2190",
    label: "Previous tab",
    group: "tabs",
  },
  nextTabArrow: {
    key: "ArrowRight",
    displayKey: "\u2192",
    label: "Next tab",
    group: "tabs",
  },

  // Context actions
  skip: {
    key: "s",
    displayKey: "s",
    label: "Skip job",
    group: "actions",
    scope: ["discovered", "ready"],
  },
  tailor: {
    key: "t",
    displayKey: "t",
    label: "Start / edit tailoring",
    group: "actions",
    scope: ["discovered", "ready"],
  },
  markApplied: {
    key: "a",
    displayKey: "a",
    label: "Mark applied",
    group: "actions",
    scope: ["ready"],
  },
  viewPdf: {
    key: "p",
    displayKey: "p",
    label: "View PDF",
    group: "actions",
    scope: ["ready"],
  },
  downloadPdf: {
    key: "d",
    displayKey: "d",
    label: "Download PDF",
    group: "actions",
    scope: ["ready"],
  },
  openListing: {
    key: "o",
    displayKey: "o",
    label: "Open job listing",
    group: "actions",
  },
  toggleSelect: {
    key: "x",
    displayKey: "x",
    label: "Toggle select",
    group: "actions",
  },
  clearSelection: {
    key: "Escape",
    displayKey: "Esc",
    label: "Clear selection",
    group: "actions",
  },

  // Meta
  search: {
    key: "$mod+k",
    displayKey: "Cmd+K",
    label: "Search jobs",
    group: "meta",
  },
  searchSlash: {
    key: "/",
    displayKey: "/",
    label: "Search jobs",
    group: "meta",
  },
  help: {
    key: "Shift+?",
    displayKey: "?",
    label: "Keyboard shortcuts",
    group: "meta",
  },
} as const satisfies Record<string, ShortcutDef>;

export type ShortcutId = keyof typeof SHORTCUTS;

// ─── Utilities ───────────────────────────────────────────────────────────────

/**
 * Return shortcuts that are active for the given tab, grouped by category.
 * Useful for rendering the bottom hint bar.
 */
export function getShortcutsForTab(tab: FilterTab): ShortcutDef[] {
  return (Object.values(SHORTCUTS) as ShortcutDef[]).filter(
    (s) => !s.scope || s.scope.includes(tab),
  );
}

/**
 * Group an array of ShortcutDefs by their `group` field.
 */
export function groupShortcuts(
  defs: ShortcutDef[],
): Record<ShortcutGroup, ShortcutDef[]> {
  const result: Record<ShortcutGroup, ShortcutDef[]> = {
    navigation: [],
    tabs: [],
    actions: [],
    meta: [],
  };
  for (const def of defs) {
    result[def.group].push(def);
  }
  return result;
}

/**
 * Deduplicate shortcuts that share the same label (e.g. j and ArrowDown both
 * map to "Next job"). Keeps the first occurrence and appends alternative
 * display keys.
 */
export interface DisplayShortcut {
  displayKeys: string[];
  label: string;
  group: ShortcutGroup;
}

export function dedupeShortcuts(defs: ShortcutDef[]): DisplayShortcut[] {
  const seen = new Map<string, DisplayShortcut>();
  const result: DisplayShortcut[] = [];
  for (const def of defs) {
    const existing = seen.get(def.label);
    if (existing) {
      existing.displayKeys.push(def.displayKey);
    } else {
      const entry: DisplayShortcut = {
        displayKeys: [def.displayKey],
        label: def.label,
        group: def.group,
      };
      seen.set(def.label, entry);
      result.push(entry);
    }
  }
  return result;
}
