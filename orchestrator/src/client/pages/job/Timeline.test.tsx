import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { JobTimeline } from "./Timeline";
import type { StageEvent } from "../../../shared/types";

const baseEvent: StageEvent = {
  id: "event-1",
  applicationId: "app-1",
  fromStage: null,
  toStage: "applied",
  occurredAt: 1735689600,
  metadata: {
    eventLabel: "Applied",
  },
};

describe("JobTimeline", () => {
  it("renders edit and delete controls when callbacks are provided", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(<JobTimeline events={[baseEvent]} onEdit={onEdit} onDelete={onDelete} />);

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
