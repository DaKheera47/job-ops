import type { Job } from "@shared/types.js";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { JobDetailsEditDrawer } from "./JobDetailsEditDrawer";

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  SheetDescription: ({ children }: { children: React.ReactNode }) => (
    <p>{children}</p>
  ),
}));

vi.mock("../api", () => ({
  updateJob: vi.fn(),
  checkSponsor: vi.fn(),
  rescoreJob: vi.fn(),
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
    title: "Backend Engineer",
    employer: "Acme",
    jobUrl: "https://example.com/job",
    applicationLink: null,
    location: "London",
    salary: null,
    deadline: null,
    jobDescription: "Build APIs",
    ...overrides,
  }) as Job;

describe("JobDetailsEditDrawer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves details and reruns sponsor check when employer changes", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    vi.mocked(api.updateJob).mockResolvedValue({} as Job);
    vi.mocked(api.checkSponsor).mockResolvedValue({} as Job);

    render(
      <JobDetailsEditDrawer
        open
        onOpenChange={onOpenChange}
        job={createJob()}
        onJobUpdated={onJobUpdated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Employer *"), {
      target: { value: "NewCo" },
    });

    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() =>
      expect(api.updateJob).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({
          employer: "NewCo",
          title: "Backend Engineer",
        }),
      ),
    );
    expect(api.checkSponsor).toHaveBeenCalledWith("job-1");
    expect(onJobUpdated).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("validates required fields before saving", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();

    render(
      <JobDetailsEditDrawer
        open
        onOpenChange={onOpenChange}
        job={createJob()}
        onJobUpdated={onJobUpdated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title *"), {
      target: { value: "   " },
    });

    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    expect(await screen.findByText("Title is required.")).toBeInTheDocument();
    expect(api.updateJob).not.toHaveBeenCalled();
    expect(onJobUpdated).not.toHaveBeenCalled();
  });

  it("offers a rescore action after successful save", async () => {
    const onJobUpdated = vi.fn().mockResolvedValue(undefined);
    const onOpenChange = vi.fn();
    const { toast } = await import("sonner");
    vi.mocked(api.updateJob).mockResolvedValue({} as Job);
    vi.mocked(api.rescoreJob).mockResolvedValue({} as Job);

    render(
      <JobDetailsEditDrawer
        open
        onOpenChange={onOpenChange}
        job={createJob()}
        onJobUpdated={onJobUpdated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Salary"), {
      target: { value: "GBP 90k" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save details/i }));

    await waitFor(() =>
      expect(vi.mocked(toast.success)).toHaveBeenCalledWith(
        "Job details updated",
        expect.any(Object),
      ),
    );

    const successCalls = vi.mocked(toast.success).mock.calls;
    const [, payload] =
      successCalls.find((call) => call[0] === "Job details updated") ?? [];
    expect(payload).toBeTruthy();

    (payload as { action?: { onClick?: () => void } }).action?.onClick?.();

    await waitFor(() => expect(api.rescoreJob).toHaveBeenCalledWith("job-1"));
    expect(onJobUpdated).toHaveBeenCalledTimes(2);
  });
});
