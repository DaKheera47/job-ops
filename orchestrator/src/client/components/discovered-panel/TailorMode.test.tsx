import type { Job } from "@shared/types.js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../../api";
import { TailorMode } from "./TailorMode";

vi.mock("../../api", () => ({
  getResumeProjectsCatalog: vi.fn().mockResolvedValue([]),
  updateJob: vi.fn(),
  summarizeJob: vi.fn(),
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

describe("TailorMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not rehydrate local edits from same-job prop updates", async () => {
    const { rerender } = render(
      <TailorMode
        job={createJob()}
        onBack={vi.fn()}
        onFinalize={vi.fn()}
        isFinalizing={false}
      />,
    );
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );

    fireEvent.change(screen.getByLabelText("Tailored Summary"), {
      target: { value: "Local draft" },
    });

    rerender(
      <TailorMode
        job={createJob({ tailoredSummary: "Older server value" })}
        onBack={vi.fn()}
        onFinalize={vi.fn()}
        isFinalizing={false}
      />,
    );

    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "Local draft",
    );
  });

  it("resets local state when job id changes", async () => {
    const { rerender } = render(
      <TailorMode
        job={createJob()}
        onBack={vi.fn()}
        onFinalize={vi.fn()}
        isFinalizing={false}
      />,
    );
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );

    fireEvent.change(screen.getByLabelText("Tailored Summary"), {
      target: { value: "Local draft" },
    });

    rerender(
      <TailorMode
        job={createJob({
          id: "job-2",
          tailoredSummary: "New job summary",
          jobDescription: "New job description",
          selectedProjectIds: "",
        })}
        onBack={vi.fn()}
        onFinalize={vi.fn()}
        isFinalizing={false}
      />,
    );

    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "New job summary",
    );
  });

  it("does not sync same-job props while summary field is focused", async () => {
    const { rerender } = render(
      <TailorMode
        job={createJob()}
        onBack={vi.fn()}
        onFinalize={vi.fn()}
        isFinalizing={false}
      />,
    );
    await waitFor(() =>
      expect(api.getResumeProjectsCatalog).toHaveBeenCalled(),
    );

    const summary = screen.getByLabelText("Tailored Summary");
    fireEvent.focus(summary);

    rerender(
      <TailorMode
        job={createJob({ tailoredSummary: "Incoming from poll" })}
        onBack={vi.fn()}
        onFinalize={vi.fn()}
        isFinalizing={false}
      />,
    );

    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "Saved summary",
    );
  });
});
