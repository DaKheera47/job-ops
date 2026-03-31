import { useEffect, useState } from "react";

let hasKeyboardEvidence = false;
const keyboardListeners = new Set<(value: boolean) => void>();
let keyboardListenersInitialized = false;
let removeKeyboardListeners: (() => void) | null = null;

function matchesMedia(query: string): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(query).matches
  );
}

export function detectKeyboardAvailability(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  const hasTouch = navigator.maxTouchPoints > 0;
  const hasHover = matchesMedia("(any-hover: hover)");
  const hasFinePointer = matchesMedia("(any-pointer: fine)");
  const isTouchFirstDevice = hasTouch && !hasHover && !hasFinePointer;

  return !isTouchFirstDevice;
}

function notifyKeyboardListeners() {
  for (const listener of keyboardListeners) {
    listener(hasKeyboardEvidence);
  }
}

function promoteKeyboardAvailability(nextValue: boolean) {
  if (hasKeyboardEvidence || !nextValue) return;
  hasKeyboardEvidence = true;
  notifyKeyboardListeners();
}

function getKeyboardAvailabilitySnapshot(): boolean {
  if (typeof window === "undefined") return false;
  promoteKeyboardAvailability(detectKeyboardAvailability());
  return hasKeyboardEvidence;
}

function ensureKeyboardListeners() {
  if (keyboardListenersInitialized || typeof window === "undefined") return;

  keyboardListenersInitialized = true;

  const updateAvailability = () => {
    promoteKeyboardAvailability(detectKeyboardAvailability());
  };

  const handleKeyDown = () => {
    promoteKeyboardAvailability(true);
  };

  const mediaQueries =
    typeof window.matchMedia === "function"
      ? [
          window.matchMedia("(any-hover: hover)"),
          window.matchMedia("(any-pointer: fine)"),
        ]
      : [];

  updateAvailability();
  window.addEventListener("keydown", handleKeyDown);

  for (const media of mediaQueries) {
    if (media.addEventListener) {
      media.addEventListener("change", updateAvailability);
      continue;
    }
    media.addListener(updateAvailability);
  }

  removeKeyboardListeners = () => {
    window.removeEventListener("keydown", handleKeyDown);

    for (const media of mediaQueries) {
      if (media.removeEventListener) {
        media.removeEventListener("change", updateAvailability);
        continue;
      }
      media.removeListener(updateAvailability);
    }
  };
}

export function _resetKeyboardAvailabilityForTests() {
  removeKeyboardListeners?.();
  removeKeyboardListeners = null;
  hasKeyboardEvidence = false;
  keyboardListeners.clear();
  keyboardListenersInitialized = false;
}

/**
 * There is no cross-browser API that reliably reports a connected hardware
 * keyboard, so we combine a touch-first heuristic with real keyboard usage.
 * Shared module state keeps hook instances aligned and avoids duplicate DOM
 * listeners across the page.
 */
export function useKeyboardAvailability(): boolean {
  const [hasKeyboard, setHasKeyboard] = useState(
    getKeyboardAvailabilitySnapshot,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    ensureKeyboardListeners();

    const listener = (value: boolean) => {
      setHasKeyboard(value);
    };

    keyboardListeners.add(listener);
    setHasKeyboard(getKeyboardAvailabilitySnapshot());

    return () => {
      keyboardListeners.delete(listener);
    };
  }, []);

  return hasKeyboard;
}
