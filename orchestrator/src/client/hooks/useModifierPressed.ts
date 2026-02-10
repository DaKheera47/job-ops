import { useEffect, useState } from "react";

/**
 * Tracks whether a specific modifier key is currently pressed.
 * Defaults to 'Control'.
 */
export function useModifierPressed(
  key: "Control" | "Alt" | "Meta" | "Shift" = "Control",
) {
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === key) setIsPressed(true);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === key) setIsPressed(false);
    };

    // Handle the case where the user switches windows/tabs while the key is down
    const handleBlur = () => setIsPressed(false);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [key]);

  return isPressed;
}
