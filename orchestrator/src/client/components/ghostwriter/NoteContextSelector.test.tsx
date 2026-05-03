import type { JobNote } from "@shared/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteContextSelector } from "./NoteContextSelector";

const makeNote = (overrides: Partial<JobNote>): JobNote => ({
  id: "note-1",
  jobId: "job-1",
  title: "Recruiter call",
  content: "Bring examples about reliability work.",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("NoteContextSelector", () => {
  it("renders notes and toggles a selected note", () => {
    const onChange = vi.fn();
    render(
      <NoteContextSelector
        notes={[makeNote({ id: "note-1", title: "Recruiter call" })]}
        selectedNoteIds={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /notes/i }));
    fireEvent.click(screen.getByLabelText(/Recruiter call/));

    expect(onChange).toHaveBeenCalledWith(["note-1"]);
  });

  it("shows per-note and aggregate trimming feedback", () => {
    const selectedNoteIds = Array.from(
      { length: 5 },
      (_, index) => `note-${index + 1}`,
    );
    const notes = selectedNoteIds.map((id, index) =>
      makeNote({
        id,
        title: `Long note ${index + 1}`,
        content: "A".repeat(3001),
      }),
    );

    render(
      <NoteContextSelector
        notes={notes}
        selectedNoteIds={selectedNoteIds}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /5 notes/i }));

    expect(screen.getAllByText("Trimmed for AI")).toHaveLength(5);
    expect(
      screen.getByText(/Selected notes exceed the AI context budget/i),
    ).toBeInTheDocument();
  });

  it("does not show aggregate overflow for a single oversized note", () => {
    render(
      <NoteContextSelector
        notes={[makeNote({ content: "A".repeat(100_000) })]}
        selectedNoteIds={["note-1"]}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /1 notes/i }));

    expect(screen.getByText("Trimmed for AI")).toBeInTheDocument();
    expect(
      screen.queryByText(/Selected notes exceed the AI context budget/i),
    ).not.toBeInTheDocument();
  });

  it("disables unchecked notes at the selection limit", () => {
    const selectedNoteIds = Array.from(
      { length: 8 },
      (_, index) => `note-${index + 1}`,
    );
    const notes = [
      ...selectedNoteIds.map((id, index) =>
        makeNote({ id, title: `Selected note ${index + 1}` }),
      ),
      makeNote({ id: "note-9", title: "Ninth note" }),
    ];

    render(
      <NoteContextSelector
        notes={notes}
        selectedNoteIds={selectedNoteIds}
        onChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /8 notes/i }));

    expect(screen.getByLabelText(/Ninth note/)).toBeDisabled();
    expect(screen.getByText("8 note limit")).toBeInTheDocument();
  });
});
