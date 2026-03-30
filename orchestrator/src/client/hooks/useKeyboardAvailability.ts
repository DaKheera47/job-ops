import { useEffect, useState } from "react";

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

/**
 * There is no cross-browser API that reliably reports a connected hardware
 * keyboard, so we combine a touch-first heuristic with real keyboard usage.
 */
export function useKeyboardAvailability(): boolean {
  const [hasKeyboard, setHasKeyboard] = useState(detectKeyboardAvailability);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const updateAvailability = () => {
      setHasKeyboard((previous) => previous || detectKeyboardAvailability());
    };

    const handleKeyDown = () => {
      setHasKeyboard(true);
    };

    const mediaQueries = [
      window.matchMedia("(any-hover: hover)"),
      window.matchMedia("(any-pointer: fine)"),
    ];

    updateAvailability();
    window.addEventListener("keydown", handleKeyDown);

    for (const media of mediaQueries) {
      if (media.addEventListener) {
        media.addEventListener("change", updateAvailability);
        continue;
      }
      media.addListener(updateAvailability);
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);

      for (const media of mediaQueries) {
        if (media.removeEventListener) {
          media.removeEventListener("change", updateAvailability);
          continue;
        }
        media.removeListener(updateAvailability);
      }
    };
  }, []);

  return hasKeyboard;
}
