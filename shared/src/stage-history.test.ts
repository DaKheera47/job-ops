import { describe, expect, it } from "vitest";
import { getEffectiveStageHistory } from "./stage-history";
import { createStageEvent } from "./testing/factories";
import type { ApplicationStage, StageEventMetadata } from "./types/jobs";

const systemApplied = (id: string, occurredAt: number) =>
  createStageEvent({
    id,
    fromStage: null,
    toStage: "applied",
    occurredAt,
    metadata: { eventLabel: "Applied", actor: "system" },
  });

const userStage = (
  id: string,
  fromStage: ApplicationStage,
  toStage: ApplicationStage,
  occurredAt: number,
  metadata: StageEventMetadata = { actor: "user", eventType: "status_update" },
) => createStageEvent({ id, fromStage, toStage, occurredAt, metadata });

const ids = (events: { id: string }[]) => events.map((entry) => entry.id);

describe("getEffectiveStageHistory", () => {
  it("returns an empty history for no events", () => {
    expect(getEffectiveStageHistory([])).toEqual([]);
  });

  it("keeps the whole history when the job never moved back to applied", () => {
    const events = [
      systemApplied("applied", 1),
      userStage("screen", "applied", "recruiter_screen", 2),
      userStage("interview", "recruiter_screen", "technical_interview", 3),
    ];

    expect(ids(getEffectiveStageHistory(events))).toEqual([
      "applied",
      "screen",
      "interview",
    ]);
  });

  it("sorts by occurredAt without mutating the input", () => {
    const events = [
      userStage("interview", "recruiter_screen", "technical_interview", 3),
      systemApplied("applied", 1),
      userStage("screen", "applied", "recruiter_screen", 2),
    ];
    const snapshot = [...events];

    expect(ids(getEffectiveStageHistory(events))).toEqual([
      "applied",
      "screen",
      "interview",
    ]);
    expect(events).toEqual(snapshot);
  });

  it("drops every stage logged before the job moved back to applied", () => {
    const events = [
      systemApplied("applied", 1),
      userStage("screen", "applied", "recruiter_screen", 2),
      userStage("back", "recruiter_screen", "applied", 3),
    ];

    expect(ids(getEffectiveStageHistory(events))).toEqual(["back"]);
  });

  it("keeps stages reached after the move back", () => {
    const events = [
      systemApplied("applied", 1),
      userStage("screen", "applied", "recruiter_screen", 2),
      userStage("back", "recruiter_screen", "applied", 3),
      userStage("assessment", "applied", "assessment", 4),
    ];

    expect(ids(getEffectiveStageHistory(events))).toEqual([
      "back",
      "assessment",
    ]);
  });

  it("uses only the most recent move back when there are several", () => {
    const events = [
      systemApplied("applied", 1),
      userStage("screen", "applied", "recruiter_screen", 2),
      userStage("back-1", "recruiter_screen", "applied", 3),
      userStage("assessment", "applied", "assessment", 4),
      userStage("back-2", "assessment", "applied", 5),
      userStage("onsite", "applied", "onsite", 6),
    ];

    expect(ids(getEffectiveStageHistory(events))).toEqual(["back-2", "onsite"]);
  });

  it("treats a system update that moves the job back to applied like a user one", () => {
    const events = [
      systemApplied("applied", 1),
      userStage("screen", "applied", "recruiter_screen", 2),
      userStage("email", "recruiter_screen", "applied", 3, {
        actor: "system",
        eventType: "status_update",
        eventLabel: "Email received",
        reasonCode: "post_application_auto_linked",
      }),
    ];

    expect(ids(getEffectiveStageHistory(events))).toEqual(["email"]);
  });

  it("keeps an applied event with no prior stage even when it sorts last", () => {
    const events = [
      userStage("screen", "applied", "recruiter_screen", 2),
      userStage("interview", "recruiter_screen", "technical_interview", 3),
      systemApplied("applied", 9),
    ];

    expect(ids(getEffectiveStageHistory(events))).toEqual([
      "screen",
      "interview",
      "applied",
    ]);
  });

  it("keeps a stage that was backdated before the system applied event", () => {
    const events = [
      systemApplied("applied", 5),
      userStage("screen", "applied", "recruiter_screen", 2),
    ];

    expect(ids(getEffectiveStageHistory(events))).toEqual([
      "screen",
      "applied",
    ]);
  });

  it("ignores user events that never left applied", () => {
    const events = [
      systemApplied("applied", 1),
      userStage("screen", "applied", "recruiter_screen", 2),
      userStage("note", "applied", "applied", 3, {
        actor: "user",
        eventType: "note",
        note: "Sent a thank-you email",
      }),
      createStageEvent({
        id: "legacy",
        fromStage: null,
        toStage: "applied",
        occurredAt: 4,
        metadata: { actor: "user", eventType: "status_update" },
      }),
    ];

    expect(ids(getEffectiveStageHistory(events))).toEqual([
      "applied",
      "screen",
      "note",
      "legacy",
    ]);
  });
});
