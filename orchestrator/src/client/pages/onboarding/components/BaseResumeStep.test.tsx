import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseResumeStep } from "./BaseResumeStep";

const defaultProps = {
  baseResumeValidation: {
    checked: false,
    hydrated: true,
    valid: false,
    message: null,
  },
  baseResumeValue: null,
  hasRxResumeAccess: false,
  importingResumeFileName: null,
  isBusy: false,
  isImportingResume: false,
  isResumeReady: false,
  isRxResumeSelfHosted: false,
  resumeSetupMode: "upload" as const,
  rxresumeApiKey: "",
  rxresumeApiKeyHint: null,
  rxresumeUrl: "",
  rxresumeValidation: {
    checked: false,
    hydrated: true,
    valid: false,
    message: null,
  },
  onImportResumeFile: vi.fn(),
  onResumeSetupModeChange: vi.fn(),
  onRxresumeApiKeyChange: vi.fn(),
  onRxresumeSelfHostedChange: vi.fn(),
  onRxresumeUrlChange: vi.fn(),
  onTemplateResumeChange: vi.fn(),
};

describe("BaseResumeStep", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows optimistic resume import progress while a file import is running", () => {
    vi.useFakeTimers();

    render(
      <BaseResumeStep
        {...defaultProps}
        importingResumeFileName="resume.pdf"
        isBusy
        isImportingResume
      />,
    );

    expect(screen.getByText("Importing resume")).toBeInTheDocument();
    expect(screen.getByText("resume.pdf")).toBeInTheDocument();
    expect(screen.getAllByText("Reading file")).toHaveLength(1);
    expect(screen.queryByText("Preparing import")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Extracting resume text"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /upload resume file/i }),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(25_000);
    });

    expect(screen.getByText("96%")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Still working. Larger PDFs and DOCX files can take a little longer.",
      ),
    ).toBeInTheDocument();
  });

  it("uses a longer optimistic import profile for Codex", () => {
    vi.useFakeTimers();

    render(
      <BaseResumeStep
        {...defaultProps}
        importingResumeFileName="resume.pdf"
        isBusy
        isImportingResume
        selectedProvider="codex"
      />,
    );

    act(() => {
      vi.advanceTimersByTime(25_000);
    });

    expect(screen.getByText("40%")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Still working. Larger PDFs and DOCX files can take a little longer.",
      ),
    ).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(35_000);
    });

    expect(screen.getByText("96%")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Still working. Codex imports can take around a minute for larger resumes.",
      ),
    ).toBeInTheDocument();
  });
});
