import type { OnboardingRequirement } from "@shared/types";
import { Check, Circle, Play, TriangleAlert } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import type { OnboardingPanelId } from "../types";

const RAIL_ITEMS: Array<{
  id: OnboardingPanelId;
  label: string;
  subtitle: string;
}> = [
  {
    id: "model",
    label: "Model",
    subtitle: "Connection",
  },
  {
    id: "resume",
    label: "Resume",
    subtitle: "Source",
  },
  {
    id: "first-run",
    label: "First run",
    subtitle: "Launch",
  },
];

function getRequirement(
  requirements: OnboardingRequirement[],
  id: OnboardingRequirement["id"],
) {
  return requirements.find((requirement) => requirement.id === id);
}

function RailIcon({
  panelId,
  requirement,
}: {
  panelId: OnboardingPanelId;
  requirement?: OnboardingRequirement;
}) {
  if (panelId === "first-run") {
    return <Play className="h-4 w-4" />;
  }
  if (requirement?.status === "ready") {
    return <Check className="h-4 w-4" />;
  }
  if (
    requirement?.status === "invalid" ||
    requirement?.status === "checking_unavailable"
  ) {
    return <TriangleAlert className="h-4 w-4" />;
  }
  return <Circle className="h-3 w-3" />;
}

export const OnboardingStepRail: React.FC<{
  activePanel: OnboardingPanelId;
  complete: boolean;
  nextRequirementId: OnboardingRequirement["id"] | null;
  onPanelSelect: (panel: OnboardingPanelId) => void;
  requirements: OnboardingRequirement[];
}> = ({
  activePanel,
  complete,
  nextRequirementId,
  onPanelSelect,
  requirements,
}) => {
  const completedCount = requirements.filter(
    (requirement) => requirement.status === "ready",
  ).length;
  const progressValue = Math.round(
    (completedCount / Math.max(requirements.length, 1)) * 100,
  );

  return (
    <div className="space-y-3" data-onboarding-target="launch-rail">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Progress</span>
        <span>{progressValue}%</span>
      </div>

      <div className="space-y-1">
        {RAIL_ITEMS.map((item) => {
          const requirement =
            item.id === "first-run"
              ? undefined
              : getRequirement(requirements, item.id);
          const active = activePanel === item.id;
          const blocked =
            item.id === "first-run" ? !complete : nextRequirementId === item.id;
          const ready =
            item.id === "first-run"
              ? complete
              : requirement?.status === "ready";

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPanelSelect(item.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors",
                active ? "bg-muted/40" : "hover:bg-muted/25",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs transition-colors",
                  ready
                    ? "border-emerald-500/50 bg-transparent text-emerald-600"
                    : blocked
                      ? "border-primary/70 bg-transparent text-primary"
                      : "border-border/60 bg-muted/40 text-muted-foreground",
                )}
              >
                <RailIcon panelId={item.id} requirement={requirement} />
              </span>
              <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  {item.subtitle}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
