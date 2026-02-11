import { createJob as createBaseJob } from "@shared/testing/factories.js";
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
    ensureAccordionOpen("Summary");

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
    ensureAccordionOpen("Summary");

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
    ensureAccordionOpen("Summary");

    fireEvent.change(screen.getByLabelText("Tailored Summary"), {
      target: { value: "Local draft" },
    });

    rerender(
      <TailorMode
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
        onBack={vi.fn()}
        onFinalize={vi.fn()}
        isFinalizing={false}
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
    ensureAccordionOpen("Summary");

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
    ensureAccordionOpen("Summary");

    expect(screen.getByLabelText("Tailored Summary")).toHaveValue(
      "Saved summary",
    );
  });

  it("does not clobber local headline edits from same-job prop updates", async () => {
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
    ensureAccordionOpen("Headline");

    fireEvent.change(screen.getByLabelText("Tailored Headline"), {
      target: { value: "Local headline draft" },
    });

    rerender(
      <TailorMode
        job={createJob({ tailoredHeadline: "Incoming headline from poll" })}
        onBack={vi.fn()}
        onFinalize={vi.fn()}
        isFinalizing={false}
      />,
    );
    ensureAccordionOpen("Headline");

    expect(screen.getByLabelText("Tailored Headline")).toHaveValue(
      "Local headline draft",
    );
  });

  it("hydrates headline and skills after AI draft generation", async () => {
    vi.mocked(api.summarizeJob).mockResolvedValueOnce({
      ...createJob(),
      tailoredSummary: "AI summary",
      tailoredHeadline: "AI headline",
      tailoredSkills: JSON.stringify([
        { name: "Backend", keywords: ["Node.js", "Kafka"] },
      ]),
    } as Job);

    render(
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

    fireEvent.click(screen.getByRole("button", { name: "Generate draft" }));

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
