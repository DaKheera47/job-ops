import { useOnboardingRequirement } from "@client/hooks/useOnboardingRequirement";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingGate } from "./OnboardingGate";

vi.mock("@client/hooks/useOnboardingRequirement", () => ({
  useOnboardingRequirement: vi.fn(),
}));

describe("OnboardingGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects incomplete users to the onboarding page", () => {
    vi.mocked(useOnboardingRequirement).mockReturnValue({
      checking: false,
      complete: false,
    });

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <OnboardingGate />
        <Routes>
          <Route path="/overview" element={<div>overview</div>} />
          <Route path="/onboarding" element={<div>onboarding</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("onboarding")).toBeInTheDocument();
  });

  it("does not redirect when the user is already on onboarding", () => {
    vi.mocked(useOnboardingRequirement).mockReturnValue({
      checking: false,
      complete: false,
    });

    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <OnboardingGate />
        <Routes>
          <Route path="/onboarding" element={<div>onboarding</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("onboarding")).toBeInTheDocument();
  });

  it("does not redirect once onboarding is complete", () => {
    vi.mocked(useOnboardingRequirement).mockReturnValue({
      checking: false,
      complete: true,
    });

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <OnboardingGate />
        <Routes>
          <Route path="/overview" element={<div>overview</div>} />
          <Route path="/onboarding" element={<div>onboarding</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("overview")).toBeInTheDocument();
    expect(screen.queryByText("onboarding")).not.toBeInTheDocument();
  });
});
