import type { Job } from "@shared/types.js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { TailoringEditor } from "./TailoringEditor";

vi.mock("../api", () => ({
  getResumeProjectsCatalog: vi.fn().mockResolvedValue([]),
  updateJob: vi.fn().mockResolvedValue({}),
  summarizeJob: vi.fn(),
  generateJobPdf: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const createJob = (overrides: Partial<Job> = {}): Job =>
  ({
    id: "job-1",
    tailoredSummary: "Saved summary",
    tailoredHeadline: "Saved headline",
    tailoredSkills: JSON.stringify([
      { name: "Core", keywords: ["React", "TypeScript"] },
    ]),
    jobDescription: "Saved description",
    selectedProjectIds: "p1",
    ...overrides,
  }) as Job;

const ensureAccordionOpen = (name: string) => {
  const trigger = screen.getByRole("button", { name });
  if (trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(trigger);
  }
};

describe("TailoringEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
