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
    jobDescription: "Saved description",
    selectedProjectIds: "p1",
    ...overrides,
  }) as Job;

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

    fireEvent.change(screen.getByLabelText("Tailored Summary"), {
      target: { value: "Local draft" },
    });

    rerender(
      <TailoringEditor
        job={createJob({ tailoredSummary: "Older server value" })}
        onUpdate={vi.fn()}
      />,
    );

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

    fireEvent.change(screen.getByLabelText("Tailored Summary"), {
      target: { value: "Local draft" },
    });

    rerender(
      <TailoringEditor
        job={createJob({
          id: "job-2",
          tailoredSummary: "New job summary",
          jobDescription: "New job description",
          selectedProjectIds: "",
        })}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "New job summary",
    );
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

    const summary = screen.getByLabelText("Tailored Summary");
    fireEvent.focus(summary);

    rerender(
      <TailoringEditor
        job={createJob({ tailoredSummary: "Incoming from poll" })}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "Saved summary",
    );
  });
});
