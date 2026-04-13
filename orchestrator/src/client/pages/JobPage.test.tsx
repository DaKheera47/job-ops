import { createJob } from "@shared/testing/factories.js";
import type { Job, JobNote } from "@shared/types.js";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { editorHtmlToMarkdown } from "@/client/lib/jobNoteContent";
import * as api from "../api";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { JobPage } from "./JobPage";

const TIPTAP_HTML =
  `<h2>Fit</h2><p>Because <strong>this team</strong> and <a href="https://example.com/docs">docs</a>.</p>` +
  `<ul><li>mission</li><li>team</li></ul>`;

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

let notesStore: JobNote[] = [];

const makeNote = (overrides: Partial<JobNote>): JobNote => ({
  id: "note-1",
  jobId: "job-1",
  title: "Application answer",
  content: "Write the answer here.",
  createdAt: "2026-01-01T09:00:00.000Z",
  updatedAt: "2026-01-01T09:00:00.000Z",
  ...overrides,
});

vi.mock("@/client/components/design-resume/RichTextEditor", () => ({
  RichTextEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <div data-testid="tiptap-editor">
      <div data-testid="tiptap-editor-value">{value}</div>
      <div>{placeholder}</div>
      <button type="button" onClick={() => onChange(TIPTAP_HTML)}>
        Emit editor content
      </button>
    </div>
  ),
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({
    children,
    onSelect,
  }: {
    children: ReactNode;
    onSelect?: () => void;
  }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
  DropdownMenuSeparator: () => <hr />,
}));

vi.mock("../api", () => ({
  getJob: vi.fn(),
  getJobStageEvents: vi.fn(),
  getJobTasks: vi.fn(),
  getJobNotes: vi.fn(),
  createJobNote: vi.fn(),
  updateJobNote: vi.fn(),
  deleteJobNote: vi.fn(),
  updateJobStageEvent: vi.fn(),
  deleteJobStageEvent: vi.fn(),
  transitionJobStage: vi.fn(),
  markAsApplied: vi.fn(),
  skipJob: vi.fn(),
  rescoreJob: vi.fn(),
  generateJobPdf: vi.fn(),
  checkSponsor: vi.fn(),
}));

vi.mock("../components/JobHeader", () => ({
  JobHeader: ({ job }: { job: Job }) => (
    <div data-testid="job-header">{job.title}</div>
  ),
}));

vi.mock("../components/ghostwriter/GhostwriterDrawer", () => ({
  GhostwriterDrawer: () => <div data-testid="ghostwriter-drawer" />,
}));

vi.mock("../components/JobDetailsEditDrawer", () => ({
  JobDetailsEditDrawer: () => null,
}));

vi.mock("../components/LogEventModal", () => ({
  LogEventModal: () => null,
}));

vi.mock("../components/ConfirmDelete", () => ({
  ConfirmDelete: ({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
  }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    description?: string;
  }) =>
    isOpen ? (
      <div role="alertdialog">
        <div>{title}</div>
        <div>{description}</div>
        <button type="button" onClick={onConfirm}>
          Delete
        </button>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("./job/Timeline", () => ({
  JobTimeline: () => <div data-testid="job-timeline" />,
}));

vi.mock("@client/hooks/useQueryErrorToast", () => ({
  useQueryErrorToast: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    message: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  notesStore = [];

  vi.mocked(api.getJob).mockResolvedValue(createJob() as Job);
  vi.mocked(api.getJobStageEvents).mockResolvedValue([]);
  vi.mocked(api.getJobTasks).mockResolvedValue([
    {
      id: "task-1",
      applicationId: "job-1",
      type: "todo",
      title: "Prepare follow-up questions",
      dueDate: 1_704_060_000,
      isCompleted: false,
      notes: "Bring questions about the team.",
    },
  ]);
  vi.mocked(api.getJobNotes).mockImplementation(async () => notesStore);
  vi.mocked(api.createJobNote).mockImplementation(async (jobId, input) => {
    const created = makeNote({
      id: `note-${notesStore.length + 1}`,
      jobId,
      title: input.title,
      content: input.content,
      createdAt: "2026-01-01T10:00:00.000Z",
      updatedAt: "2026-01-01T10:00:00.000Z",
    });
    notesStore = [created, ...notesStore];
    return created;
  });
  vi.mocked(api.updateJobNote).mockImplementation(
    async (_jobId, noteId, input) => {
      const current = notesStore.find((note) => note.id === noteId);
      if (!current) {
        throw new Error("Note not found");
      }

      const updated = {
        ...current,
        title: input.title,
        content: input.content,
        updatedAt: "2026-01-01T11:00:00.000Z",
      };
      notesStore = notesStore.map((note) =>
        note.id === noteId ? updated : note,
      );
      return updated;
    },
  );
  vi.mocked(api.deleteJobNote).mockImplementation(async (_jobId, noteId) => {
    notesStore = notesStore.filter((note) => note.id !== noteId);
  });
});

const renderJobPage = () =>
  render(
    <MemoryRouter initialEntries={["/job/job-1"]}>
      <Routes>
        <Route path="/job/:id" element={<JobPage />} />
      </Routes>
    </MemoryRouter>,
  );

describe("JobPage notes", () => {
  it("renders the full-width notes section and defaults to markdown preview", async () => {
    notesStore = [
      makeNote({
        id: "note-older",
        title: "Recruiter contact",
        content: "Reach out to Jane.",
        updatedAt: "2026-01-01T09:00:00.000Z",
      }),
      makeNote({
        id: "note-newer",
        title: "Why this company",
        content:
          "# Strong fit\n\n- Great mission\n- Good team\n\n[Team](https://example.com)",
        updatedAt: "2026-01-01T12:00:00.000Z",
      }),
    ];

    renderJobPage();

    await waitFor(() => {
      expect(screen.getByTestId("job-header")).toHaveTextContent(
        "Backend Engineer",
      );
    });

    expect(screen.getByTestId("job-notes-section")).toHaveClass("w-full");
    expect(screen.getByTestId("job-notes-list")).toBeInTheDocument();
    expect(screen.getByTestId("job-notes-detail")).toBeInTheDocument();

    const applicationDetails = screen.getByText("Application details");
    const notesHeading = screen.getByText("Notes");
    const upcomingTasks = screen.getByText("Upcoming tasks");

    expect(
      applicationDetails.compareDocumentPosition(notesHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      upcomingTasks.compareDocumentPosition(notesHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(
      await screen.findByRole("heading", { name: "Strong fit" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team" })).toHaveAttribute(
      "href",
      "https://example.com",
    );

    fireEvent.click(screen.getByRole("button", { name: /Recruiter contact/i }));

    await waitFor(() =>
      expect(screen.getByText("Reach out to Jane.")).toBeInTheDocument(),
    );
  });

  it("switches between markdown view and TipTap edit mode inline", async () => {
    notesStore = [];

    renderJobPage();

    await waitFor(() =>
      expect(
        screen.getByText(
          "No notes yet. Capture reminders, interview prep, or links in markdown.",
        ),
      ).toBeInTheDocument(),
    );

    fireEvent.click(
      within(screen.getByTestId("job-notes-detail")).getByRole("button", {
        name: /add note/i,
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("tiptap-editor")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Why this company" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Emit editor content" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /save note/i }));

    const expectedMarkdown = editorHtmlToMarkdown(TIPTAP_HTML);

    await waitFor(() =>
      expect(api.createJobNote).toHaveBeenCalledWith("job-1", {
        title: "Why this company",
        content: expectedMarkdown,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Note saved");
    expect(
      await screen.findByRole("heading", { name: "Fit" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "docs" })).toHaveAttribute(
      "href",
      "https://example.com/docs",
    );

    fireEvent.click(
      within(screen.getByTestId("job-notes-detail")).getByRole("button", {
        name: "Edit note",
      }),
    );

    await waitFor(() =>
      expect(screen.getByTestId("tiptap-editor")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("tiptap-editor-value")).toHaveTextContent(
      "<h2>Fit</h2>",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Emit editor content" }),
    );
    fireEvent.click(screen.getByRole("button", { name: /save note/i }));

    await waitFor(() =>
      expect(api.updateJobNote).toHaveBeenCalledWith("job-1", "note-1", {
        title: "Why this company",
        content: expectedMarkdown,
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Note saved");

    fireEvent.click(
      within(screen.getByTestId("job-notes-detail")).getByRole("button", {
        name: "Delete note",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: /^delete$/i,
      }),
    );

    await waitFor(() =>
      expect(api.deleteJobNote).toHaveBeenCalledWith("job-1", "note-1"),
    );
    expect(toast.success).toHaveBeenCalledWith("Note deleted");
    await waitFor(() =>
      expect(screen.queryByText("Why this company")).toBeNull(),
    );
  });
});
