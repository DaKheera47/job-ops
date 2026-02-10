import { useEffect, useRef } from "react";
import { tinykeys } from "tinykeys";

type KeyBindingMap = Record<string, (event: KeyboardEvent) => void>;

/**
 * Elements that should swallow keyboard shortcuts so single-key bindings
 * don't fire while the user is typing in a form control.
 */
const INPUT_TAG_NAMES = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const MODIFIER_PATTERN = /(?:^|\+)(\$mod|Shift|Control|Meta|Alt)(?:\+|$)/;

function isEditableTarget(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return false;
  if (INPUT_TAG_NAMES.has(target.tagName)) return true;
  if (target.isContentEditable) return true;
  return false;
}

/**
 * Thin React wrapper around `tinykeys`.
 *
 * - Automatically unsubscribes on unmount.
 * - Guards against firing inside inputs/textareas/contenteditable elements
 *   (so shortcuts don't conflict with the command bar, tailoring editor, etc.).
 * - Uses a stable ref for the binding map so callers don't need to memoize.
 *
 * Modifier shortcuts (e.g. "$mod+K") bypass the input guard because the user
 * explicitly held a modifier -- those are intentional even inside inputs.
 */
export function useHotkeys(
  bindings: KeyBindingMap,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const bindingsRef = useRef(bindings);
  bindingsRef.current = bindings;

  useEffect(() => {
    if (!enabled) return;

    // Build a guarded version of every binding.
    const guarded: KeyBindingMap = {};
    for (const key of Object.keys(bindingsRef.current)) {
      const hasModifier = key
        .split(" ")
        .some((sequence) => MODIFIER_PATTERN.test(sequence));

      guarded[key] = (event: KeyboardEvent) => {
        // Skip single-key shortcuts when the user is typing in an input.
        if (!hasModifier && isEditableTarget(event)) return;
        bindingsRef.current[key]?.(event);
      };
    }

    const unsubscribe = tinykeys(window, guarded);
    return unsubscribe;
  }, [enabled]);
}
