import { PipelineProgress } from "@client/components";
import { useProfile } from "@client/hooks/useProfile";
import welcomeMessages from "@shared/messages/jobs-welcome.json";
import type { JobStatus } from "@shared/types.js";
import type React from "react";
import { useMemo } from "react";

interface OrchestratorSummaryProps {
  stats: Record<JobStatus, number>;
  isPipelineRunning: boolean;
}

// Simple string hash function for seeded random
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

export const OrchestratorSummary: React.FC<OrchestratorSummaryProps> = ({
  stats,
  isPipelineRunning,
}) => {
  const totalJobs = Object.values(stats).reduce((a, b) => a + b, 0);
  const { personName } = useProfile();

  const welcomeText = useMemo(() => {
    const firstName = personName?.split(" ")[0] || "User";
    const dateSeed = new Date().toDateString();

    // Create a predictable hash based on the current date and user's name
    const seed = Math.abs(hashCode(`${firstName}-${dateSeed}`));
    const lines = welcomeMessages.lines;
    const line = lines[seed % lines.length];

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

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-medium tracking-tight">{welcomeText}</h1>
      </div>

      {isPipelineRunning && (
        <div className="max-w-3xl">
          <PipelineProgress isRunning={isPipelineRunning} />
        </div>
      )}
    </section>
  );
};
