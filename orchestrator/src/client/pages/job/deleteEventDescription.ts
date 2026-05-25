import { STAGE_LABELS, type StageEvent } from "@shared/types.js";

const DEFAULT_DESCRIPTION =
  "This action cannot be undone. This will permanently delete this event from the timeline.";

/**
 * Build a delete-confirmation description for a stage event.
 *
 * When the deleted event is the latest in the timeline, removing it will roll
 * the job's stage/status back to the previous event (or to "discovered" if it
 * was the only event). Surface that so the user knows derived state will move.
 */
export function getDeleteEventDescription(
  events: StageEvent[],
  eventToDelete: string | null,
): string {
  if (!eventToDelete) return DEFAULT_DESCRIPTION;

  const lastEvent = events.at(-1);
  if (!lastEvent || lastEvent.id !== eventToDelete) {
    return DEFAULT_DESCRIPTION;
  }

  const previousEvent = events.at(-2);
  if (!previousEvent) {
    return "This is the only event on this job. Deleting it will reset the job to its initial discovered state.";
  }

  const previousLabel = STAGE_LABELS[previousEvent.toStage];
  return `Deleting this event will roll the job's stage back to "${previousLabel}".`;
}
