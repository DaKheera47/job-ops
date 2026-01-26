import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { ManualImportSheet } from "./ManualImportSheet";

vi.mock("../api", () => ({
  fetchJobFromUrl: vi.fn(),
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
      <ManualImportSheet
        open
        onOpenChange={onOpenChange}
        onImported={onImported}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        "Paste the full job description here, or enter a URL above to fetch it...",
      ),
      { target: { value: rawDescription } },
    );
    fireEvent.click(screen.getByRole("button", { name: /analyze jd/i }));

    const titleInput = await screen.findByPlaceholderText(
      "e.g. Junior Backend Engineer",
    );
    expect(titleInput).toHaveValue("Backend Engineer");

    const jdTextarea = screen.getByPlaceholderText(
      "Paste the job description...",
    ) as HTMLTextAreaElement;
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
      }),
    );
  });

  it("shows warnings and requires required fields before import", async () => {
    const rawDescription = "Manual QA Engineer role.";

    vi.mocked(api.inferManualJob).mockResolvedValue({
      job: {},
      warning: "AI inference failed. Fill details manually.",
    });

    render(
      <ManualImportSheet open onOpenChange={vi.fn()} onImported={vi.fn()} />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        "Paste the full job description here, or enter a URL above to fetch it...",
      ),
      { target: { value: rawDescription } },
    );
    fireEvent.click(screen.getByRole("button", { name: /analyze jd/i }));

    await screen.findByText("AI inference failed. Fill details manually.");

    const importButton = screen.getByRole("button", { name: /import job/i });
    expect(importButton).toBeDisabled();

    fireEvent.change(
      screen.getByPlaceholderText("e.g. Junior Backend Engineer"),
      {
        target: { value: "QA Engineer" },
      },
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. Acme Labs"), {
      target: { value: "Acme Labs" },
    });

    await waitFor(() => expect(importButton).toBeEnabled());
  });

  it("returns to the paste step when inference fails", async () => {
    const rawDescription = "Backend role description.";

    vi.mocked(api.inferManualJob).mockRejectedValue(
      new Error("Inference failed"),
    );

    render(
      <ManualImportSheet open onOpenChange={vi.fn()} onImported={vi.fn()} />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        "Paste the full job description here, or enter a URL above to fetch it...",
      ),
      { target: { value: rawDescription } },
    );
    fireEvent.click(screen.getByRole("button", { name: /analyze jd/i }));

    await screen.findByText("Inference failed");
    expect(
      screen.getByRole("button", { name: /analyze jd/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("e.g. Junior Backend Engineer"),
    ).not.toBeInTheDocument();
  });

  it("shows a toast error and keeps the sheet open when import fails", async () => {
    vi.mocked(api.inferManualJob).mockResolvedValue({
      job: {
        title: "Backend Engineer",
        employer: "Acme Labs",
      },
    });
    vi.mocked(api.importManualJob).mockRejectedValue(
      new Error("Import failed"),
    );

    const onOpenChange = vi.fn();

    render(
      <ManualImportSheet
        open
        onOpenChange={onOpenChange}
        onImported={vi.fn()}
      />,
    );

    fireEvent.change(
      screen.getByPlaceholderText(
        "Paste the full job description here, or enter a URL above to fetch it...",
      ),
      { target: { value: "Backend Engineer role." } },
    );
    fireEvent.click(screen.getByRole("button", { name: /analyze jd/i }));

    await screen.findByPlaceholderText("e.g. Junior Backend Engineer");

    fireEvent.click(screen.getByRole("button", { name: /import job/i }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Import failed"),
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /import job/i })).toBeEnabled();
  });

  describe("URL fetch functionality", () => {
    it("shows Paste button when URL field is empty, Fetch when URL is entered", async () => {
      render(
        <ManualImportSheet open onOpenChange={vi.fn()} onImported={vi.fn()} />,
      );

      // Initially should show Paste button
      expect(
        screen.getByRole("button", { name: /paste/i }),
      ).toBeInTheDocument();

      // Enter a URL
      fireEvent.change(
        screen.getByPlaceholderText("https://example.com/job-posting"),
        { target: { value: "https://example.com/job" } },
      );

      // Should now show Fetch button
      expect(
        screen.getByRole("button", { name: /fetch/i }),
      ).toBeInTheDocument();
    });

    it("fetches URL and proceeds to review on successful fetch", async () => {
      vi.mocked(api.fetchJobFromUrl).mockResolvedValue({
        content: "Software Engineer role at Acme Corp",
        url: "https://example.com/job",
      });
      vi.mocked(api.inferManualJob).mockResolvedValue({
        job: {
          title: "Software Engineer",
          employer: "Acme Corp",
          location: "Remote",
          jobDescription: "Great opportunity to join our team.",
        },
      });

      render(
        <ManualImportSheet open onOpenChange={vi.fn()} onImported={vi.fn()} />,
      );

      // Enter a URL
      fireEvent.change(
        screen.getByPlaceholderText("https://example.com/job-posting"),
        { target: { value: "https://example.com/job" } },
      );

      // Click Fetch
      fireEvent.click(screen.getByRole("button", { name: /fetch/i }));

      // Should show loading state then review
      await screen.findByPlaceholderText("e.g. Junior Backend Engineer");

      expect(api.fetchJobFromUrl).toHaveBeenCalledWith({
        url: "https://example.com/job",
      });
      expect(api.inferManualJob).toHaveBeenCalledWith({
        jobDescription: "Software Engineer role at Acme Corp",
      });

      // Check inferred values are shown
      expect(
        screen.getByPlaceholderText("e.g. Junior Backend Engineer"),
      ).toHaveValue("Software Engineer");
      expect(screen.getByPlaceholderText("e.g. Acme Labs")).toHaveValue(
        "Acme Corp",
      );
    });

    it("preserves fetched URL in the job URL field", async () => {
      vi.mocked(api.fetchJobFromUrl).mockResolvedValue({
        content: "Job description content",
        url: "https://example.com/job",
      });
      vi.mocked(api.inferManualJob).mockResolvedValue({
        job: {
          title: "Engineer",
          employer: "Company",
        },
      });

      render(
        <ManualImportSheet open onOpenChange={vi.fn()} onImported={vi.fn()} />,
      );

      fireEvent.change(
        screen.getByPlaceholderText("https://example.com/job-posting"),
        { target: { value: "https://example.com/job" } },
      );
      fireEvent.click(screen.getByRole("button", { name: /fetch/i }));

      await screen.findByPlaceholderText("e.g. Junior Backend Engineer");

      // Check the job URL field has the fetched URL (first https://... input is Job URL)
      const urlInputs = screen.getAllByPlaceholderText("https://...");
      expect(urlInputs[0]).toHaveValue("https://example.com/job");
    });

    it("shows error and returns to paste step when fetch fails", async () => {
      vi.mocked(api.fetchJobFromUrl).mockRejectedValue(
        new Error("Failed to fetch URL"),
      );

      render(
        <ManualImportSheet open onOpenChange={vi.fn()} onImported={vi.fn()} />,
      );

      fireEvent.change(
        screen.getByPlaceholderText("https://example.com/job-posting"),
        { target: { value: "https://example.com/bad-url" } },
      );
      fireEvent.click(screen.getByRole("button", { name: /fetch/i }));

      await screen.findByText("Failed to fetch URL");

      // Should still be on paste step
      expect(
        screen.getByPlaceholderText(
          "Paste the full job description here, or enter a URL above to fetch it...",
        ),
      ).toBeInTheDocument();
    });

    it("shows error when inference fails after fetch", async () => {
      vi.mocked(api.fetchJobFromUrl).mockResolvedValue({
        content: "Job content",
        url: "https://example.com/job",
      });
      vi.mocked(api.inferManualJob).mockRejectedValue(
        new Error("Inference failed"),
      );

      render(
        <ManualImportSheet open onOpenChange={vi.fn()} onImported={vi.fn()} />,
      );

      fireEvent.change(
        screen.getByPlaceholderText("https://example.com/job-posting"),
        { target: { value: "https://example.com/job" } },
      );
      fireEvent.click(screen.getByRole("button", { name: /fetch/i }));

      await screen.findByText("Inference failed");

      // Should be back on paste step
      expect(
        screen.getByPlaceholderText(
          "Paste the full job description here, or enter a URL above to fetch it...",
        ),
      ).toBeInTheDocument();
    });
  });
});
