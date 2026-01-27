import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StageEvent } from "../../../shared/types";
import { JobTimeline } from "./Timeline";

const baseEvent: StageEvent = {
  id: "event-1",
  applicationId: "app-1",
  fromStage: null,
  toStage: "applied",
  title: "Applied",
  groupId: null,
  occurredAt: 1735689600,
  metadata: {
    eventLabel: "Applied",
  },
  outcome: null,
};

describe("JobTimeline", () => {
  it("renders edit and delete controls when callbacks are provided", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <JobTimeline events={[baseEvent]} onEdit={onEdit} onDelete={onDelete} />,
    );

    const editButton = screen.getByTitle("Edit event");
    const deleteButton = screen.getByTitle("Delete event");

    fireEvent.click(editButton);
    fireEvent.click(deleteButton);

    expect(onEdit).toHaveBeenCalledWith(baseEvent);
    expect(onDelete).toHaveBeenCalledWith("event-1");
  });

  it("omits edit and delete controls when callbacks are missing", () => {
    render(<JobTimeline events={[baseEvent]} />);

    expect(screen.queryByTitle("Edit event")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete event")).not.toBeInTheDocument();
  });
});
