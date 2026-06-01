import type { OnboardingStatusResponse } from "@shared/types";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import {
  ACTIONS,
  EVENTS,
  type EventData,
  Joyride,
  STATUS,
  type Step,
  type TooltipRenderProps,
} from "react-joyride";
import { getAuthScopedStorageKey } from "@/client/api/client";
import { Button } from "@/components/ui/button";
import type { OnboardingPanelId } from "../types";

const TOUR_STORAGE_KEY = "jobops.onboarding.coach.dismissed.v1";

type CoachStep = Step & {
  data?: {
    panel: OnboardingPanelId;
  };
};

function readDismissed(): boolean {
  try {
    return (
      localStorage.getItem(getAuthScopedStorageKey(TOUR_STORAGE_KEY)) === "1"
    );
  } catch {
    return true;
  }
}

function writeDismissed(): void {
  try {
    localStorage.setItem(getAuthScopedStorageKey(TOUR_STORAGE_KEY), "1");
  } catch {
    // Ignore storage failures in restricted browser contexts.
  }
}

function removeJoyridePortal(): void {
  try {
    document.getElementById("react-joyride-portal")?.remove();
  } catch {
    // Ignore DOM cleanup failures; unmounting Joyride is the primary cleanup.
  }
}

function CoachTooltip({
  continuous,
  index,
  primaryProps,
  skipProps,
  step,
  tooltipProps,
}: TooltipRenderProps) {
  return (
    <div
      {...tooltipProps}
      className="max-w-[22rem] rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg"
    >
      {step.title ? (
        <div className="text-sm font-semibold">{step.title}</div>
      ) : null}
      <div className="mt-2 text-sm leading-6 text-muted-foreground">
        {step.content}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" size="sm" {...skipProps}>
          Skip
        </Button>
        <Button type="button" size="sm" {...primaryProps}>
          {continuous ? "Next" : index === 0 ? "Start" : "Done"}
        </Button>
      </div>
    </div>
  );
}

export const OnboardingCoach: React.FC<{
  activePanel: OnboardingPanelId;
  onPanelChange: (panel: OnboardingPanelId) => void;
  replayNonce: number;
  status: OnboardingStatusResponse | null;
}> = ({ activePanel, onPanelChange, replayNonce, status }) => {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const stopTour = () => {
    writeDismissed();
    setRun(false);
    setStepIndex(0);
    removeJoyridePortal();
  };

  const steps = useMemo<CoachStep[]>(
    () => [
      {
        target: '[data-onboarding-target="launch-rail"]',
        title: "Launch console",
        content:
          "Work left to right: model, resume, then first run. The highlighted row is the next requirement Job Ops needs.",
        disableBeacon: true,
        data: { panel: activePanel },
      },
      {
        target: '[data-onboarding-target="model-form"]',
        title: "Model check",
        content:
          "Save the provider, endpoint, key, and model here. Job Ops verifies the connection before it lets the pipeline launch.",
        data: { panel: "model" },
      },
      {
        target: '[data-onboarding-target="resume-options"]',
        title: "Resume check",
        content:
          "Upload a file or connect Reactive Resume. Search terms stay out of setup and are prepared from this resume automatically.",
        data: { panel: "resume" },
      },
      {
        target: '[data-onboarding-target="first-run"]',
        title: "First run",
        content:
          "Once both checks pass, jump to the ready queue. Your first run will prepare search terms from the loaded resume.",
        data: { panel: "first-run" },
      },
      {
        target: '[data-onboarding-target="primary-action"]',
        title: "One next action",
        content:
          "The primary button always fixes the current blocker. If the server finds a problem, the recovery step stays inline.",
        data: { panel: status?.nextRequirementId ?? activePanel },
      },
    ],
    [activePanel, status?.nextRequirementId],
  );

  useEffect(() => {
    if (!status || readDismissed()) return;
    setStepIndex(0);
    setRun(true);
  }, [status]);

  useEffect(() => {
    if (!status || replayNonce === 0) return;
    setStepIndex(0);
    setRun(true);
  }, [replayNonce, status]);

  useEffect(() => {
    if (!run) return;
    const panel = steps[stepIndex]?.data?.panel;
    if (panel && panel !== activePanel) {
      onPanelChange(panel);
    }
  }, [activePanel, onPanelChange, run, stepIndex, steps]);

  const handleEvent = (data: EventData) => {
    const finished = data.status === STATUS.FINISHED;
    const skipped = data.status === STATUS.SKIPPED;
    const closed = data.action === ACTIONS.CLOSE;
    const completedLastStep =
      data.type === EVENTS.STEP_AFTER &&
      data.action !== ACTIONS.PREV &&
      data.index >= steps.length - 1;
    if (finished || skipped || closed || completedLastStep) {
      stopTour();
      return;
    }

    if (data.type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex((current) => Math.min(current + 1, steps.length - 1));
      return;
    }

    if (data.type === EVENTS.STEP_AFTER) {
      const direction = data.action === ACTIONS.PREV ? -1 : 1;
      setStepIndex((current) =>
        Math.max(0, Math.min(current + direction, steps.length - 1)),
      );
    }
  };

  if (!run) {
    return null;
  }

  return (
    <Joyride
      continuous
      onEvent={handleEvent}
      run={run}
      scrollToFirstStep
      stepIndex={stepIndex}
      steps={steps}
      options={{
        arrowColor: "hsl(var(--popover))",
        backgroundColor: "hsl(var(--popover))",
        buttons: ["skip", "primary"],
        dismissKeyAction: "close",
        overlayClickAction: false,
        overlayColor: "rgba(0, 0, 0, 0.5)",
        primaryColor: "hsl(var(--primary))",
        skipBeacon: true,
        textColor: "hsl(var(--popover-foreground))",
        zIndex: 80,
      }}
      tooltipComponent={CoachTooltip}
    />
  );
};
