import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { useDemoInfo } from "./hooks/useDemoInfo";

vi.mock("./hooks/useDemoInfo", () => ({
  useDemoInfo: vi.fn(),
}));

vi.mock("react-transition-group", () => ({
  SwitchTransition: ({ children }: { children: React.ReactNode }) => children,
  CSSTransition: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/ui/sonner", () => ({
  Toaster: () => null,
}));

vi.mock("./components/BasicAuthPrompt", () => ({
  BasicAuthPrompt: () => null,
}));

vi.mock("./components/OnboardingGate", () => ({
  OnboardingGate: () => null,
}));

vi.mock("./pages/GmailOauthCallbackPage", () => ({
  GmailOauthCallbackPage: () => null,
}));

vi.mock("./pages/HomePage", () => ({
  HomePage: () => <div>overview</div>,
}));

vi.mock("./pages/InProgressBoardPage", () => ({
  InProgressBoardPage: () => null,
}));

vi.mock("./pages/JobPage", () => ({
  JobPage: () => null,
}));

vi.mock("./pages/OrchestratorPage", () => ({
  OrchestratorPage: () => null,
}));

vi.mock("./pages/SettingsPage", () => ({
  SettingsPage: () => null,
}));

vi.mock("./pages/TrackingInboxPage", () => ({
  TrackingInboxPage: () => null,
}));

vi.mock("./pages/VisaSponsorsPage", () => ({
  VisaSponsorsPage: () => null,
}));

describe("App demo banner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("shows a waitlist link in demo mode", () => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: true,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <App />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "try.jobops.app" });
    expect(link).toHaveAttribute(
      "href",
      "https://try.jobops.app?utm_source=demo&utm_medium=banner&utm_campaign=waitlist",
    );
  });

  it("does not render the demo banner waitlist link when demo mode is disabled", () => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link", { name: "try.jobops.app" })).toBeNull();
  });

  it("lets the user dismiss the waitlist banner and keeps it hidden", () => {
    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: true,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <App />
      </MemoryRouter>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /dismiss demo waitlist banner/i }),
    );

    expect(screen.queryByRole("link", { name: "try.jobops.app" })).toBeNull();
    expect(localStorage.getItem("jobops.demoWaitlistBannerDismissed")).toBe(
      "1",
    );
  });
});
