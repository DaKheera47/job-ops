import type { StageEvent } from "./types/jobs";

/**
 * Only fromStage/toStage are used because the server derives fromStage from
 * the history at insert time and never lets a client set it, whereas
 * metadata (actor, reason code) is rewritten wholesale whenever an event is
 * edited.
 */
const isMoveBackToApplied = (event: StageEvent): boolean =>
  event.toStage === "applied" &&
  event.fromStage !== null &&
  event.fromStage !== "applied";

/**
 * Narrows an application's stage history to the events that still count
 * toward its progress.
 *
 * "applied" is the funnel's entry stage. Whatever moves an application from a
 * later stage back to it (a user undoing a mistaken board move, or a
 * tracking-inbox update that resolves to "applied") also resets the job's
 * status and its lane on the board, so analytics follow suit: every event
 * before the most recent such move is treated as retracted. Applied events
 * with no prior stage (marking a job applied, seeded data, notes on a job
 * that never left "applied") are never a move back, regardless of where they
 * sort.
 *
 * Returns a new array sorted by occurredAt ascending; the input is not
 * mutated.
 */
export function getEffectiveStageHistory(
  events: readonly StageEvent[],
): StageEvent[] {
  const ordered = [...events].sort((a, b) => a.occurredAt - b.occurredAt);
  for (let index = ordered.length - 1; index > 0; index -= 1) {
    if (isMoveBackToApplied(ordered[index])) {
      return ordered.slice(index);
    }
  }
  return ordered;
}
