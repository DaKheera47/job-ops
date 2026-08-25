import { useOnboardingStatus } from "@client/hooks/useOnboardingStatus";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingGate } from "./OnboardingGate";

vi.mock("@client/api", () => ({
  getAuthBootstrapStatus: vi.fn(async () => ({ setupRequired: false })),
}));

vi.mock("@client/hooks/useOnboardingStatus", () => ({
  useOnboardingStatus: vi.fn(),
}));

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: () => ({
    error: null,
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("OnboardingGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects incomplete users to the onboarding page", async () => {
    vi.mocked(useOnboardingStatus).mockReturnValue({
      checking: false,
      complete: false,
    } as any);

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <OnboardingGate />
        <Routes>
          <Route path="/overview" element={<div>overview</div>} />
          <Route path="/onboarding" element={<div>onboarding</div>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: createWrapper() },
    );

    expect(await screen.findByText("onboarding")).toBeInTheDocument();
  });

  it("does not redirect when the user is already on onboarding", () => {
    vi.mocked(useOnboardingStatus).mockReturnValue({
      checking: false,
      complete: false,
    } as any);

    render(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <OnboardingGate />
        <Routes>
          <Route path="/onboarding" element={<div>onboarding</div>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText("onboarding")).toBeInTheDocument();
  });

  it("does not check onboarding while the user is on sign-in", () => {
    render(
      <MemoryRouter initialEntries={["/sign-in"]}>
        <OnboardingGate />
        <Routes>
          <Route path="/sign-in" element={<div>sign-in</div>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText("sign-in")).toBeInTheDocument();
    expect(useOnboardingStatus).not.toHaveBeenCalled();
  });

  it("does not redirect once onboarding is complete", async () => {
    vi.mocked(useOnboardingStatus).mockReturnValue({
      checking: false,
      complete: true,
    } as any);

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <OnboardingGate />
        <Routes>
          <Route path="/overview" element={<div>overview</div>} />
          <Route path="/onboarding" element={<div>onboarding</div>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(useOnboardingStatus).toHaveBeenCalled();
    });
    expect(screen.getByText("overview")).toBeInTheDocument();
    expect(screen.queryByText("onboarding")).not.toBeInTheDocument();
  });

  it("allows Resume Studio only while the resume step is next", async () => {
    vi.mocked(useOnboardingStatus).mockReturnValue({
      checking: false,
      complete: false,
      nextRequirementId: "resume",
    } as any);

    render(
      <MemoryRouter initialEntries={["/design-resume"]}>
        <OnboardingGate />
        <Routes>
          <Route path="/design-resume" element={<div>resume studio</div>} />
          <Route path="/onboarding" element={<div>onboarding</div>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(useOnboardingStatus).toHaveBeenCalled());
    expect(screen.getByText("resume studio")).toBeInTheDocument();
    expect(screen.queryByText("onboarding")).not.toBeInTheDocument();
  });

  it("sends brand-new installs to onboarding before auth redirects", async () => {
    const { getAuthBootstrapStatus } = await import("@client/api");
    vi.mocked(getAuthBootstrapStatus).mockResolvedValueOnce({
      setupRequired: true,
    });

    render(
      <MemoryRouter initialEntries={["/overview"]}>
        <OnboardingGate />
        <Routes>
          <Route path="/overview" element={<div>overview</div>} />
          <Route path="/onboarding" element={<div>onboarding</div>} />
        </Routes>
      </MemoryRouter>,
      { wrapper: createWrapper() },
    );

    expect(await screen.findByText("onboarding")).toBeInTheDocument();
    expect(useOnboardingStatus).not.toHaveBeenCalled();
  });
});
