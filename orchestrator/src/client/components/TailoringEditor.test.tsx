import { createJob as createBaseJob } from "@shared/testing/factories.js";
import type { Job } from "@shared/types.js";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { useProfile } from "../hooks/useProfile";
import { _resetTracerReadinessCache } from "../hooks/useTracerReadiness";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { TailoringEditor } from "./TailoringEditor";

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

vi.mock("../api", () => ({
  getResumeProjectsCatalog: vi.fn().mockResolvedValue([]),
  updateJob: vi.fn().mockResolvedValue({}),
  summarizeJob: vi.fn(),
  generateJobPdf: vi.fn(),
  getTracerReadiness: vi.fn(),
}));

vi.mock("../hooks/useProfile", () => ({
  useProfile: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createJob = (overrides: Partial<Job> = {}): Job =>
  createBaseJob({
    id: "job-1",
    tailoredSummary: "Saved summary",
    tailoredHeadline: "Saved headline",
    tailoredSkills: JSON.stringify([
      { name: "Core", keywords: ["React", "TypeScript"] },
    ]),
    jobDescription: "Saved description",
    selectedProjectIds: "p1",
    ...overrides,
  });

const ensureAccordionOpen = (name: string) => {
  const trigger = screen.getByRole("button", { name });
  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(trigger);
  }
};

describe("TailoringEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetTracerReadinessCache();
    vi.mocked(api.getTracerReadiness).mockResolvedValue({
      status: "ready",
      canEnable: true,
      publicBaseUrl: "https://my-jobops.example.com",
      healthUrl: "https://my-jobops.example.com/health",
      checkedAt: Date.now(),
      lastSuccessAt: Date.now(),
      reason: null,
    });
    vi.mocked(useProfile).mockReturnValue({
      profile: {
        basics: {
          summary: "Original base summary",
          label: "Original base headline",
        },
        sections: {
          skills: {
            items: [
              {
                id: "s1",
                name: "Backend",
                description: "",
                level: 0,
                keywords: ["Node.js", "TypeScript"],
                visible: true,
              },
            ],
          },
        },
      },
      error: null,
      isLoading: false,
      personName: "Resume",
      refreshProfile: vi.fn(),
    });
  });

  it("does not rehydrate local edits from same-job prop updates", async () => {
    const { rerender } = render(
      <TailoringEditor job={createJob()} onUpdate={vi.fn()} />,
    );
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );
    ensureAccordionOpen("Summary");

    fireEvent.change(screen.getByLabelText("Tailored Summary"), {
      target: { value: "Local draft" },
    });

    rerender(
      <TailoringEditor
        job={createJob({ tailoredSummary: "Older server value" })}
        onUpdate={vi.fn()}
      />,
    );
    ensureAccordionOpen("Summary");

    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "Local draft",
    );
  });

  it("resets local state when job id changes", async () => {
    const { rerender } = render(
      <TailoringEditor job={createJob()} onUpdate={vi.fn()} />,
    );
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );
    ensureAccordionOpen("Summary");

    fireEvent.change(screen.getByLabelText("Tailored Summary"), {
      target: { value: "Local draft" },
    });

    rerender(
      <TailoringEditor
        job={createJob({
          id: "job-2",
          tailoredSummary: "New job summary",
          tailoredHeadline: "New job headline",
          tailoredSkills: JSON.stringify([
            { name: "Backend", keywords: ["Node.js", "Postgres"] },
          ]),
          jobDescription: "New job description",
          selectedProjectIds: "",
        })}
        onUpdate={vi.fn()}
      />,
    );
    ensureAccordionOpen("Summary");
    ensureAccordionOpen("Headline");
    ensureAccordionOpen("Tailored Skills");
    ensureAccordionOpen("Backend");

    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "New job summary",
    );
    expect(screen.getByLabelText("Tailored Headline")).toHaveValue(
      "New job headline",
    );
    expect(screen.getByDisplayValue("Node.js, Postgres")).toBeInTheDocument();
  });

  it("emits dirty state changes", async () => {
    const onDirtyChange = vi.fn();
    render(
      <TailoringEditor
        job={createJob()}
        onUpdate={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    );
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );
    ensureAccordionOpen("Summary");

    fireEvent.change(screen.getByLabelText("Tailored Summary"), {
      target: { value: "Local draft" },
    });

    expect(onDirtyChange).toHaveBeenCalledWith(true);
  });

  it("does not sync same-job props while summary field is focused", async () => {
    const { rerender } = render(
      <TailoringEditor job={createJob()} onUpdate={vi.fn()} />,
    );
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );
    ensureAccordionOpen("Summary");

    const summary = screen.getByLabelText("Tailored Summary");
    fireEvent.focus(summary);

    rerender(
      <TailoringEditor
        job={createJob({ tailoredSummary: "Incoming from poll" })}
        onUpdate={vi.fn()}
      />,
    );
    ensureAccordionOpen("Summary");

    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "Saved summary",
    );
  });

  it("does not clobber local headline edits from same-job prop updates", async () => {
    const { rerender } = render(
      <TailoringEditor job={createJob()} onUpdate={vi.fn()} />,
    );
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );
    ensureAccordionOpen("Headline");

    fireEvent.change(screen.getByLabelText("Tailored Headline"), {
      target: { value: "Local headline draft" },
    });

    rerender(
      <TailoringEditor
        job={createJob({ tailoredHeadline: "Incoming headline from poll" })}
        onUpdate={vi.fn()}
      />,
    );
    ensureAccordionOpen("Headline");

    expect(screen.getByLabelText("Tailored Headline")).toHaveValue(
      "Local headline draft",
    );
  });

  it("saves headline and skills in update payload", async () => {
    render(<TailoringEditor job={createJob()} onUpdate={vi.fn()} />);
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );
    ensureAccordionOpen("Headline");
    ensureAccordionOpen("Tailored Skills");
    ensureAccordionOpen("Core");

    fireEvent.change(screen.getByLabelText("Tailored Headline"), {
      target: { value: "Updated headline" },
    });
    fireEvent.change(screen.getByLabelText("Keywords (comma-separated)"), {
      target: { value: "Node.js, TypeScript" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Selection" }));

    await waitFor(() =>
      expect(api.updateJob).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({
          tailoredHeadline: "Updated headline",
          tailoredSkills:
            '[{"name":"Core","keywords":["Node.js","TypeScript"]}]',
        }),
      ),
    );
  });

  it("hydrates headline and skills after AI summarize", async () => {
    vi.mocked(api.summarizeJob).mockResolvedValueOnce({
      ...createJob(),
      tailoredSummary: "AI summary",
      tailoredHeadline: "AI headline",
      tailoredSkills: JSON.stringify([
        { name: "Backend", keywords: ["Node.js", "Kafka"] },
      ]),
    } as Job);

    render(<TailoringEditor job={createJob()} onUpdate={vi.fn()} />);
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );

    fireEvent.click(screen.getByRole("button", { name: "AI Summarize" }));

    await waitFor(() => ensureAccordionOpen("Headline"));
    expect(screen.getByLabelText("Tailored Headline")).toHaveValue(
      "AI headline",
    );
    ensureAccordionOpen("Tailored Skills");
    ensureAccordionOpen("Backend");
    expect(screen.getByDisplayValue("Backend")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Node.js, Kafka")).toBeInTheDocument();
  });

  it("persists tracer-links toggle in tailoring save payload", async () => {
    render(
      <TailoringEditor
        job={createJob({ tracerLinksEnabled: false })}
        onUpdate={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );
    await waitFor(() => expect(api.getTracerReadiness).toHaveBeenCalled());
    ensureAccordionOpen("Tracer Links");

    fireEvent.click(screen.getByLabelText("Enable tracer links for this job"));
    fireEvent.click(screen.getByRole("button", { name: "Save Selection" }));

    await waitFor(() =>
      expect(api.updateJob).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({
          tracerLinksEnabled: true,
        }),
      ),
    );
  });

  it("supports undo to template and redo to AI draft", async () => {
    render(<TailoringEditor job={createJob()} onUpdate={vi.fn()} />);
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );

    ensureAccordionOpen("Summary");
    fireEvent.click(screen.getAllByLabelText("Undo to template")[0]);
    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "Original base summary",
    );
    fireEvent.click(screen.getAllByLabelText("Redo to AI draft")[0]);
    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "Saved summary",
    );

    ensureAccordionOpen("Headline");
    fireEvent.click(screen.getAllByLabelText("Undo to template")[1]);
    expect(screen.getByLabelText("Tailored Headline")).toHaveValue(
      "Original base headline",
    );
    fireEvent.click(screen.getAllByLabelText("Redo to AI draft")[1]);
    expect(screen.getByLabelText("Tailored Headline")).toHaveValue(
      "Saved headline",
    );

    ensureAccordionOpen("Tailored Skills");
    fireEvent.click(screen.getAllByLabelText("Undo to template")[2]);
    ensureAccordionOpen("Backend");
    expect(screen.getByDisplayValue("Node.js, TypeScript")).toBeInTheDocument();
    fireEvent.click(screen.getAllByLabelText("Redo to AI draft")[2]);
    ensureAccordionOpen("Core");
    expect(screen.getByDisplayValue("React, TypeScript")).toBeInTheDocument();
  });

  it("resets redo baseline when switching jobs", async () => {
    const { rerender } = render(
      <TailoringEditor job={createJob()} onUpdate={vi.fn()} />,
    );
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );

    ensureAccordionOpen("Summary");
    fireEvent.click(screen.getAllByLabelText("Undo to template")[0]);
    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "Original base summary",
    );

    rerender(
      <TailoringEditor
        job={createJob({
          id: "job-2",
          tailoredSummary: "Second job summary",
        })}
        onUpdate={vi.fn()}
      />,
    );

    ensureAccordionOpen("Summary");
    fireEvent.click(screen.getAllByLabelText("Undo to template")[0]);
    fireEvent.click(screen.getAllByLabelText("Redo to AI draft")[0]);
    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "Second job summary",
    );
  });

  it("keeps undo disabled until profile template is loaded", async () => {
    vi.mocked(useProfile).mockReturnValue({
      profile: null,
      error: null,
      isLoading: true,
      personName: "Resume",
      refreshProfile: vi.fn(),
    });

    render(<TailoringEditor job={createJob()} onUpdate={vi.fn()} />);
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );
    ensureAccordionOpen("Summary");
    ensureAccordionOpen("Headline");
    ensureAccordionOpen("Tailored Skills");

    for (const button of screen.getAllByLabelText("Undo to template")) {
      expect(button).toBeDisabled();
    }
  });
});
