import type { StageEvent } from "@shared/types.js";
import { describe, expect, it } from "vitest";
import { getDeleteEventDescription } from "./deleteEventDescription";

const makeEvent = (id: string, toStage: StageEvent["toStage"]): StageEvent => ({
  id,
  applicationId: "job-1",
  title: "",
  groupId: null,
  fromStage: null,
  toStage,
  occurredAt: 0,
  metadata: null,
  outcome: null,
});

describe("getDeleteEventDescription", () => {
  it("returns the default description when no event is targeted", () => {
    expect(getDeleteEventDescription([], null)).toMatch(/cannot be undone/i);
  });

  it("returns the default description when deleting a non-latest event", () => {
    const events = [
      makeEvent("a", "applied"),
      makeEvent("b", "recruiter_screen"),
      makeEvent("c", "technical_interview"),
    ];
    expect(getDeleteEventDescription(events, "a")).toMatch(/cannot be undone/i);
    expect(getDeleteEventDescription(events, "b")).toMatch(/cannot be undone/i);
  });

  it("warns about rolling back when deleting the latest event", () => {
    const events = [
      makeEvent("a", "applied"),
      makeEvent("b", "recruiter_screen"),
    ];
    const description = getDeleteEventDescription(events, "b");
    expect(description.toLowerCase()).toContain("roll");
    expect(description).toContain("Applied");
  });

  it("warns about resetting when deleting the only event", () => {
    const events = [makeEvent("a", "applied")];
    const description = getDeleteEventDescription(events, "a");
    expect(description.toLowerCase()).toContain("discovered");
  });

  it("returns the default when the targeted event does not exist", () => {
    const events = [makeEvent("a", "applied")];
    expect(getDeleteEventDescription(events, "nonexistent")).toMatch(
      /cannot be undone/i,
    );
  });
});
