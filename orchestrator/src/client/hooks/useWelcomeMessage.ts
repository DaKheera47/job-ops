import welcomeMessages from "@shared/messages/jobs-welcome.json";
import { useMemo } from "react";
import { useProfile } from "./useProfile";

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export function useWelcomeMessage(): string {
  const { personName } = useProfile();

  return useMemo(() => {
    const firstName = personName?.split(" ")[0] || "User";
    const today = new Date().toDateString();

    let isFirstDay = true;
    try {
      let firstSeenDate = localStorage.getItem("jobOps_firstWelcomeDate");
      if (!firstSeenDate) {
        firstSeenDate = today;
        localStorage.setItem("jobOps_firstWelcomeDate", today);
      }
      isFirstDay = firstSeenDate === today;
    } catch (_e) {
      // Ignore localStorage errors (e.g. private mode restrictions)
      // Fallback to true so we just show the first message
    }

    const lines = welcomeMessages.lines;
    let selectedIndex = 0; // Always default to the first message

    if (!isFirstDay) {
      // If it's not their first day, randomize consistently for the day
      const seed = Math.abs(hashCode(`${firstName}-${today}`));
      selectedIndex = seed % lines.length;
    }

    const line = lines[selectedIndex];

    switch (line.placement) {
      case "inline":
        return line.text.replace("{name}", firstName);
      case "prefix":
        return `${firstName}, ${line.text}`;
      case "suffix":
        return `${line.text}, ${firstName}.`;
      default:
        return line.text;
    }
  }, [personName]);
}
