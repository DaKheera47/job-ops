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
import { trackProductEvent } from "@/lib/analytics";
import { toAnalyticsStep } from "../analytics";
import type { OnboardingPanelId } from "../types";

const TOUR_STORAGE_KEY = "jobops.onboarding.coach.dismissed.v1";
const ACCOUNT_TOUR_STORAGE_KEY = "jobops.onboarding.coach.account.dismissed.v1";

type CoachStep = Step & {
  data?: {
    panel: OnboardingPanelId;
  };
};

function readDismissed(storageKey: string): boolean {
  try {
    return sessionStorage.getItem(getAuthScopedStorageKey(storageKey)) === "1";
  } catch {
    return true;
  }
}

function writeDismissed(storageKey: string): void {
  try {
    sessionStorage.setItem(getAuthScopedStorageKey(storageKey), "1");
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
  showAccount?: boolean;
  showModel?: boolean;
  scope?: "account" | "launch";
  status: OnboardingStatusResponse | null;
}> = ({
  activePanel,
  onPanelChange,
  replayNonce,
  showAccount = true,
  showModel = true,
  scope = "launch",
  status,
}) => {
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const storageKey =
    scope === "account" ? ACCOUNT_TOUR_STORAGE_KEY : TOUR_STORAGE_KEY;

  const stopTour = (action: "skip" | "done" = "done") => {
    trackProductEvent("onboarding_coach_interacted", {
      action,
      scope,
      step: toAnalyticsStep(activePanel),
    });
    writeDismissed(storageKey);
    setRun(false);
    setStepIndex(0);
    removeJoyridePortal();
  };

  useEffect(() => () => removeJoyridePortal(), []);

  const steps = useMemo<CoachStep[]>(() => {
    const introContent =
      showAccount && showModel
        ? "Complete the setup checks that let Job Ops work for you: a workspace account, an LLM for reasoning, and a resume for matching."
        : showModel
          ? "Complete the setup checks that let Job Ops work for you: an LLM for reasoning and a resume for matching."
          : "Complete the resume setup check that lets Job Ops match jobs and prepare your search.";
    const primaryPanel =
      status?.nextRequirementId === "model" && !showModel
        ? activePanel
        : (status?.nextRequirementId ?? activePanel);
    const introStep: CoachStep = {
      target: '[data-onboarding-target="launch-rail"]',
      title: "Load the command centre",
      content: introContent,
      data: { panel: activePanel },
    };

    const primaryActionStep: CoachStep = {
      target: '[data-onboarding-target="primary-action"]',
      title: "One next action",
      content:
        activePanel === "account"
          ? "Use this button to create the workspace account and continue to the next steps."
          : "Use this button to verify the current setup check. When both checks pass, it opens the ready queue.",
      data: { panel: primaryPanel },
    };

    if (scope === "account") {
      return [
        introStep,
        {
          target: '[data-onboarding-target="account-form"]',
          title: "Workspace account",
          content:
            "Create the private account that owns this Job Ops workspace before connecting the model and resume.",
          data: { panel: "account" },
        },
        {
          target: '[data-onboarding-target="account-rail-model"]',
          title: "Then connect the model",
          content:
            "Model setup comes next. It unlocks scoring, tailoring, ghostwriting, and email classification after the account exists.",
          data: { panel: "account" },
        },
        {
          target: '[data-onboarding-target="account-rail-resume"]',
          title: "Then load your resume",
          content:
            "Resume setup follows the model check and becomes the baseline for matching and applications.",
          data: { panel: "account" },
        },
        {
          target: '[data-onboarding-target="account-rail-first-run"]',
          title: "Then open the queue",
          content:
            "After setup, Job Ops prepares search terms from your resume before sending you into the ready queue.",
          data: { panel: "account" },
        },
        primaryActionStep,
      ];
    }

    const launchSteps: CoachStep[] = [introStep];

    if (showModel) {
      launchSteps.push({
        target: '[data-onboarding-target="model-form"]',
        title: "LLM engine",
        content:
          "This model powers scoring, tailoring, ghostwriting, and email classification. Verify it once so Job Ops can read opportunities for you.",
        data: { panel: "model" },
      });
    }

    launchSteps.push({
      target: '[data-onboarding-target="resume-options"]',
      title: "Resume baseline",
      content:
        "Your resume becomes the baseline for job matching, fit assessment, and application workflows. Upload a file or connect Reactive Resume.",
      data: { panel: "resume" },
    });

    if (status?.complete) {
      launchSteps.push({
        target: '[data-onboarding-target="first-run"]',
        title: "Ready queue",
        content:
          "After setup, Job Ops prepares search terms from your resume before sending you into the ready queue.",
        data: { panel: "first-run" },
      });
    }

    return launchSteps;
  }, [
    activePanel,
    scope,
    showAccount,
    showModel,
    status?.complete,
    status?.nextRequirementId,
  ]);

  useEffect(() => {
    if ((scope === "launch" && !status) || readDismissed(storageKey)) return;
    setStepIndex(0);
    setRun(true);
    trackProductEvent("onboarding_coach_interacted", {
      action: "start",
      scope,
      step: toAnalyticsStep(activePanel),
    });
  }, [activePanel, scope, status, storageKey]);

  useEffect(() => {
    if ((scope === "launch" && !status) || replayNonce === 0) return;
    setStepIndex(0);
    setRun(true);
    trackProductEvent("onboarding_coach_interacted", {
      action: "start",
      scope,
      step: toAnalyticsStep(activePanel),
    });
  }, [activePanel, replayNonce, scope, status]);

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
      stopTour(skipped ? "skip" : "done");
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
