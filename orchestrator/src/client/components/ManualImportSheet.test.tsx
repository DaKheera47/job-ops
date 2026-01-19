import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { ManualImportSheet } from "./ManualImportSheet";
import * as api from "../api";
import { toast } from "sonner";

vi.mock("../api", () => ({
  inferManualJob: vi.fn(),
  importManualJob: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("ManualImportSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs analyze -> review -> import on the happy path", async () => {
    const rawDescription = "  Backend Engineer role in London.  ";
    const onOpenChange = vi.fn();
    const onImported = vi.fn().mockResolvedValue(undefined);

    vi.mocked(api.inferManualJob).mockResolvedValue({
      job: {
        title: "Backend Engineer",
        employer: "Acme Labs",
        location: "London, UK",
      },
    });
    vi.mocked(api.importManualJob).mockResolvedValue({ id: "job-1" } as any);

    render(
      <ManualImportSheet open onOpenChange={onOpenChange} onImported={onImported} />
    );

    fireEvent.change(
      screen.getByPlaceholderText("Paste the full job description here..."),
      { target: { value: rawDescription } }
    );
    fireEvent.click(screen.getByRole("button", { name: /analyze jd/i }));

    const titleInput = await screen.findByPlaceholderText("e.g. Junior Backend Engineer");
    expect(titleInput).toHaveValue("Backend Engineer");

    const jdTextarea = screen.getByPlaceholderText("Paste the job description...") as HTMLTextAreaElement;
    expect(jdTextarea.value).toBe(rawDescription.trim());

    fireEvent.change(screen.getByPlaceholderText("e.g. GBP 45k-55k"), {
      target: { value: "  120k  " },
    });

    fireEvent.click(screen.getByRole("button", { name: /import job/i }));

    await waitFor(() => expect(api.importManualJob).toHaveBeenCalled());
    expect(api.importManualJob).toHaveBeenCalledWith({
      job: expect.objectContaining({
        title: "Backend Engineer",
        employer: "Acme Labs",
        location: "London, UK",
        salary: "120k",
        jobDescription: rawDescription.trim(),
      }),
    });

    await waitFor(() => expect(onImported).toHaveBeenCalledWith("job-1"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalledWith(
      "Job imported",
      expect.objectContaining({
        description: expect.any(String),
      })
    );
  });

  it("shows warnings and requires required fields before import", async () => {
    const rawDescription = "Manual QA Engineer role.";

    vi.mocked(api.inferManualJob).mockResolvedValue({
      job: {},
      warning: "AI inference failed. Fill details manually.",
    });

    render(
      <ManualImportSheet open onOpenChange={vi.fn()} onImported={vi.fn()} />
    );

    fireEvent.change(
      screen.getByPlaceholderText("Paste the full job description here..."),
      { target: { value: rawDescription } }
    );
    fireEvent.click(screen.getByRole("button", { name: /analyze jd/i }));

    await screen.findByText("AI inference failed. Fill details manually.");

    const importButton = screen.getByRole("button", { name: /import job/i });
    expect(importButton).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g. Junior Backend Engineer"), {
      target: { value: "QA Engineer" },
    });
    fireEvent.change(screen.getByPlaceholderText("e.g. Acme Labs"), {
      target: { value: "Acme Labs" },
    });

    await waitFor(() => expect(importButton).toBeEnabled());
  });

  it("returns to the paste step when inference fails", async () => {
    const rawDescription = "Backend role description.";

    vi.mocked(api.inferManualJob).mockRejectedValue(new Error("Inference failed"));

    render(
      <ManualImportSheet open onOpenChange={vi.fn()} onImported={vi.fn()} />
    );

    fireEvent.change(
      screen.getByPlaceholderText("Paste the full job description here..."),
      { target: { value: rawDescription } }
    );
    fireEvent.click(screen.getByRole("button", { name: /analyze jd/i }));

    await screen.findByText("Inference failed");
    expect(screen.getByRole("button", { name: /analyze jd/i })).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("e.g. Junior Backend Engineer")
    ).not.toBeInTheDocument();
  });

  it("shows a toast error and keeps the sheet open when import fails", async () => {
    vi.mocked(api.inferManualJob).mockResolvedValue({
      job: {
        title: "Backend Engineer",
        employer: "Acme Labs",
      },
    });
    vi.mocked(api.importManualJob).mockRejectedValue(new Error("Import failed"));

    const onOpenChange = vi.fn();

    render(
      <ManualImportSheet open onOpenChange={onOpenChange} onImported={vi.fn()} />
    );

    fireEvent.change(
      screen.getByPlaceholderText("Paste the full job description here..."),
      { target: { value: "Backend Engineer role." } }
    );
    fireEvent.click(screen.getByRole("button", { name: /analyze jd/i }));

    await screen.findByPlaceholderText("e.g. Junior Backend Engineer");

    fireEvent.click(screen.getByRole("button", { name: /import job/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Import failed")
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /import job/i })).toBeEnabled();
  });
});
