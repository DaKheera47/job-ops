import type React from "react";

interface KbdHintProps {
  /** The key to display, e.g. "s", "Cmd+K", "?" */
  shortcut: string;
  /** Additional className */
  className?: string;
}

/**
 * Inline keyboard-hint badge for action buttons.
 *
 * Rendered as a small `<kbd>` element styled to look like a physical key cap.
 * Hidden on mobile (below `lg` breakpoint) since keyboard shortcuts are only
 * useful with a physical keyboard.
 */
export const KbdHint: React.FC<KbdHintProps> = ({ shortcut, className }) => (
  <kbd
    className={`hidden lg:inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded border border-border/60 bg-muted/40 text-[10px] font-mono font-medium text-muted-foreground leading-none ${className ?? ""}`}
  >
    {shortcut}
  </kbd>
);
