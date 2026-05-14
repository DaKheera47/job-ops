/**
 * Event bus for Gmail post-application sync.  Decouples the ingestion
 * pipeline from the Telegram-notification subscriber so we can plug in more
 * destinations later (web push, email digest, …) without touching the
 * ingestion path.
 */

import { EventEmitter } from "node:events";
import { logger } from "@infra/logger";
import type { PostApplicationRouterStageTarget } from "@shared/types";

/**
 * What did the sync do with a given email?
 *  - `auto_linked`        — confidence ≥ auto-link threshold AND matched a job;
 *                           stage event was created automatically.
 *  - `pending_review`     — relevant but below auto-link threshold; sits in
 *                           the Tracking Inbox for the user to confirm.
 *  - `no_match`           — relevant email that didn't match any active job.
 *  - `ignored`            — not a recruitment-related email (spam/marketing).
 *  - `error`              — processing failed; the email is left unchanged.
 */
export type GmailMessageAction =
  | "auto_linked"
  | "pending_review"
  | "no_match"
  | "ignored"
  | "error";

export interface GmailProcessedMessageEvent {
  /** Account that owns the mailbox.  Currently we only support "default". */
  accountKey: string;
  /** Internal post_application_messages.id of the saved record. */
  messageId: string;
  /** External Gmail message id (idempotency key for de-duping notifications). */
  externalMessageId: string;
  /** Whether this email has been seen before this sync run.  Used to avoid
   *  re-emitting notifications for emails the user already saw. */
  isFirstProcessing: boolean;
  /** Email metadata for human-readable formatting. */
  subject: string;
  fromAddress: string;
  senderName: string | null;
  receivedAtMs: number;
  /** Smart-Router classification. */
  action: GmailMessageAction;
  confidence: number;
  stageTarget: PostApplicationRouterStageTarget;
  reason: string;
  /** Matched job, if any.  Populated for auto_linked and pending_review. */
  matchedJobId: string | null;
  matchedJobTitle: string | null;
  matchedJobEmployer: string | null;
  /** Stage transition that was/would be applied.  "no_change" means the
   *  classifier decided to keep the current stage. */
  fromStage: string | null;
  toStage: string;
  /** Whether transitionStage() was actually called and persisted a new event. */
  stageTransitionApplied: boolean;
  /** Free-text error from processing.  Set when action === "error". */
  errorMessage: string | null;
}

const events = new EventEmitter();
events.setMaxListeners(20);

export function subscribeToGmailProcessedMessages(
  listener: (event: GmailProcessedMessageEvent) => void,
): () => void {
  events.on("message", listener);
  return () => events.off("message", listener);
}

export function emitGmailProcessedMessage(
  event: GmailProcessedMessageEvent,
): void {
  try {
    events.emit("message", event);
  } catch (err) {
    logger.warn("Gmail processed-message listener threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
