import * as api from "@client/api";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useRxResumeConfigState } from "@client/hooks/useRxResumeConfigState";
import { useSettings } from "@client/hooks/useSettings";
import { validateAndMaybePersistRxResumeMode } from "@client/lib/rxresume-config";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { OnboardingPage } from "./OnboardingPage";

vi.mock("@client/api", () => ({
  validateLlm: vi.fn(),
  validateRxresume: vi.fn(),
  validateResumeConfig: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@client/hooks/useDemoInfo", () => ({
  useDemoInfo: vi.fn(),
}));

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: vi.fn(),
}));

vi.mock("@client/hooks/useRxResumeConfigState", () => ({
  useRxResumeConfigState: vi.fn(),
}));

vi.mock("@client/lib/rxresume-config", () => ({
  getRxResumeCredentialDrafts: vi.fn((values) => values),
  getRxResumeMissingCredentialLabels: vi.fn(() => []),
  validateAndMaybePersistRxResumeMode: vi.fn(),
}));

vi.mock("@client/components/ReactiveResumeConfigPanel", () => ({
  ReactiveResumeConfigPanel: () => <div>Reactive resume panel</div>,
}));

vi.mock("@client/pages/settings/components/BaseResumeSelection", () => ({
  BaseResumeSelection: () => <div>Base resume selection</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const baseSettings = {
  llmProvider: { value: "openrouter", default: "openrouter", override: null },
  llmBaseUrl: { value: "", default: "", override: null },
  llmApiKeyHint: "sk-t",
  pdfRenderer: { value: "rxresume", default: "rxresume", override: null },
  onboardingBasicAuthDecision: null,
  rxresumeUrl: "https://resume.example.com",
  rxresumeApiKeyHint: "rx-k",
  rxresumeBaseResumeId: "resume-1",
  basicAuthUser: null,
  basicAuthPassword: null,
  basicAuthPasswordHint: null,
  basicAuthActive: false,
};

let currentSettings: any;

function renderPage() {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/jobs/ready" element={<div>ready page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    currentSettings = { ...baseSettings };

    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    vi.mocked(useSettings).mockImplementation(() => ({
      settings: currentSettings,
      isLoading: false,
      refreshSettings: vi.fn(),
      error: null,
      showSponsorInfo: true,
      renderMarkdownInJobDescriptions: true,
    }));

    vi.mocked(useRxResumeConfigState).mockReturnValue({
      storedRxResume: {
        hasV5ApiKey: true,
        hasBaseUrl: true,
      },
      baseResumeId: "resume-1",
      syncBaseResumeId: () => "resume-1",
      getBaseResumeId: () => "resume-1",
      setBaseResumeId: vi.fn(),
    } as any);
    vi.mocked(validateAndMaybePersistRxResumeMode).mockResolvedValue({
      validation: {
        valid: true,
        message: null,
      },
    } as any);
  });

  it("keeps the LLM step visible even when a key hint already exists", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: false,
      message: "Connection failed",
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });

    renderPage();

    await waitFor(() => expect(api.validateLlm).toHaveBeenCalled());
    expect(
      screen.getByText("Choose the LLM connection Job Ops should trust."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(
      screen.getByText(/leave blank to keep the saved key/i),
    ).toBeInTheDocument();
  });

  it("does not treat local providers as validated before the connection check passes", async () => {
    currentSettings = {
      ...baseSettings,
      llmProvider: { value: "lmstudio", default: "lmstudio", override: null },
      llmBaseUrl: {
        value: "http://localhost:1234",
        default: "",
        override: null,
      },
      llmApiKeyHint: null,
    };

    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: false,
      message: "LM Studio is unreachable",
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });

    renderPage();

    await waitFor(() => {
      expect(api.validateLlm).toHaveBeenCalledWith({
        provider: "lmstudio",
        baseUrl: "http://localhost:1234",
        apiKey: undefined,
      });
    });

    expect(
      screen.getByRole("button", { name: /save connection/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revalidate connection/i }),
    ).not.toBeInTheDocument();
  });

  it("requires an explicit basic auth decision before onboarding can finish", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Choose the LLM connection Job Ops should trust."),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /basic auth/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Decide whether write actions should be protected."),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /choose an option/i }));

    const { toast } = await import("sonner");
    expect(toast.info).toHaveBeenCalledWith(
      "Choose whether to enable basic auth or skip it for now",
    );
  });

  it("lets the user skip basic auth and finish onboarding", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.updateSettings).mockImplementation(async () => {
      currentSettings = {
        ...currentSettings,
        onboardingBasicAuthDecision: "skipped",
      };
      return currentSettings;
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Choose the LLM connection Job Ops should trust."),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /basic auth/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Decide whether write actions should be protected."),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/skip for now/i));
    fireEvent.click(screen.getByRole("button", { name: /finish onboarding/i }));

    await waitFor(() => {
      expect(screen.getByText("ready page")).toBeInTheDocument();
    });
    expect(api.updateSettings).toHaveBeenCalledWith({
      onboardingBasicAuthDecision: "skipped",
    });
  });

  it("does not leave onboarding early when basic auth is saved before the other steps are complete", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: false,
      message: "Connection failed",
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.updateSettings).mockResolvedValue({
      ...baseSettings,
      onboardingBasicAuthDecision: "skipped",
    } as any);

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Choose the LLM connection Job Ops should trust."),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /basic auth/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Decide whether write actions should be protected."),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/skip for now/i));
    fireEvent.click(screen.getByRole("button", { name: /finish onboarding/i }));

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        onboardingBasicAuthDecision: "skipped",
      });
    });

    expect(screen.queryByText("ready page")).not.toBeInTheDocument();
    expect(
      screen.getByText("Decide whether write actions should be protected."),
    ).toBeInTheDocument();
  });

  it("does not auto-advance after saving the LLM step", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.updateSettings).mockResolvedValue(baseSettings as any);

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Choose the LLM connection Job Ops should trust."),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /revalidate connection/i }),
    );

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalled();
    });

    expect(
      screen.getByText("Choose the LLM connection Job Ops should trust."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Connect the resume engine that will export tailored PDFs.",
      ),
    ).not.toBeInTheDocument();
  });

  it("keeps the RxResume URL hidden unless self-hosted mode is enabled", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });

    currentSettings = {
      ...baseSettings,
      rxresumeUrl: "",
    };

    vi.mocked(useSettings).mockImplementation(() => ({
      settings: currentSettings,
      isLoading: false,
      refreshSettings: vi.fn(),
      error: null,
      showSponsorInfo: true,
      renderMarkdownInJobDescriptions: true,
    }));

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /rxresume/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          "Connect the resume engine that will export tailored PDFs.",
        ),
      ).toBeInTheDocument();
    });

    expect(screen.queryByLabelText(/custom url/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", { name: /self-hosted reactive resume/i }),
    );

    expect(screen.getByLabelText(/custom url/i)).toBeInTheDocument();
  });

  it("lets the full basic-auth option card change the selection", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /basic auth/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Decide whether write actions should be protected."),
      ).toBeInTheDocument();
    });

    const skipCard = screen
      .getByText(
        /finish onboarding now and come back in settings if you decide to lock the app down later/i,
      )
      .closest("label");

    if (!skipCard) {
      throw new Error("Expected the skip card to render as a label");
    }

    fireEvent.click(skipCard);

    expect(
      screen.getByRole("button", { name: /finish onboarding/i }),
    ).toBeEnabled();
  });
});
