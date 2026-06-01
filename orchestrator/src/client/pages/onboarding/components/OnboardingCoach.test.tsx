import type { OnboardingStatusResponse } from "@shared/types";
import { act, render, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingCoach } from "./OnboardingCoach";

const joyrideState = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
}));

vi.mock("react-joyride", () => ({
  Joyride: (props: Record<string, unknown>) => {
    joyrideState.props = props;
    return <div data-testid="joyride" />;
  },
  STATUS: {
    FINISHED: "finished",
    SKIPPED: "skipped",
  },
}));

const status: OnboardingStatusResponse = {
  complete: false,
  nextRequirementId: "model",
  requirements: [
    {
      id: "model",
      status: "needs_action",
      title: "Connect your model",
      message: "LLM API key is missing.",
      primaryAction: "connect_model",
    },
    {
      id: "resume",
      status: "needs_action",
      title: "Load your resume",
      message: "Upload a resume.",
      primaryAction: "upload_resume",
    },
  ],
};

function renderCoach(
  props?: Partial<React.ComponentProps<typeof OnboardingCoach>>,
) {
  return render(
    <OnboardingCoach
      activePanel="model"
      onPanelChange={vi.fn()}
      replayNonce={0}
      status={status}
      {...props}
    />,
  );
}

describe("OnboardingCoach", () => {
  beforeEach(() => {
    localStorage.clear();
    joyrideState.props = null;
  });

  it("starts when not dismissed and stores dismissed state when skipped", async () => {
    renderCoach();

    await waitFor(() => {
      expect(joyrideState.props?.run).toBe(true);
    });

    act(() => {
      (joyrideState.props?.onEvent as (data: unknown) => void)({
        action: "skip",
        index: 0,
        status: "skipped",
        type: "tour:status",
      });
    });

    expect(localStorage.getItem("jobops.onboarding.coach.dismissed.v1")).toBe(
      "1",
    );
  });

  it("can be replayed after dismissal", async () => {
    localStorage.setItem("jobops.onboarding.coach.dismissed.v1", "1");

    const { rerender } = renderCoach();
    expect(joyrideState.props?.run).toBe(false);

    rerender(
      <OnboardingCoach
        activePanel="model"
        onPanelChange={vi.fn()}
        replayNonce={1}
        status={status}
      />,
    );

    await waitFor(() => {
      expect(joyrideState.props?.run).toBe(true);
    });
  });

  it("skips safely when a target is absent", async () => {
    renderCoach();

    await waitFor(() => {
      expect(joyrideState.props?.stepIndex).toBe(0);
    });

    act(() => {
      (joyrideState.props?.onEvent as (data: unknown) => void)({
        action: "next",
        index: 0,
        status: "running",
        type: "error:target_not_found",
      });
    });

    await waitFor(() => {
      expect(joyrideState.props?.stepIndex).toBe(1);
    });
  });
});
