import { randomUUID } from "node:crypto";
import type {
  ApplicationStage,
  ApplicationTask,
  ApplicationTaskType,
  JobOutcome,
  JobStatus,
  StageEvent,
  StageEventMetadata,
} from "@shared/types";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, schema } from "../db/index";

const { jobs, stageEvents, tasks } = schema;

const STAGE_TO_STATUS: Record<ApplicationStage, JobStatus> = {
  applied: "applied",
  recruiter_screen: "in_progress",
  assessment: "in_progress",
  hiring_manager_screen: "in_progress",
  technical_interview: "in_progress",
  onsite: "in_progress",
  offer: "in_progress",
  closed: "in_progress",
};

export const stageEventMetadataSchema = z
  .object({
    note: z.string().nullable().optional(),
    actor: z.enum(["system", "user"]).optional(),
    groupId: z.string().nullable().optional(),
    groupLabel: z.string().nullable().optional(),
    eventLabel: z.string().nullable().optional(),
    externalUrl: z.string().nullable().optional(),
    reasonCode: z.string().nullable().optional(),
    eventType: z
      .enum(["interview_log", "status_update", "note"])
      .nullable()
      .optional(),
  })
  .strict();

export async function getStageEvents(
  applicationId: string,
): Promise<StageEvent[]> {
  const rows = await db
    .select()
    .from(stageEvents)
    .where(eq(stageEvents.applicationId, applicationId))
    .orderBy(asc(stageEvents.occurredAt));

  return rows.map((row) => ({
    id: row.id,
    applicationId: row.applicationId,
    title: row.title,
    groupId: row.groupId ?? null,
    fromStage: row.fromStage as ApplicationStage | null,
    toStage: row.toStage as ApplicationStage,
    occurredAt: row.occurredAt,
    metadata: parseMetadata(row.metadata),
    outcome: (row.outcome as JobOutcome | null) ?? null,
  }));
}

export async function getTasks(
  applicationId: string,
  includeCompleted = false,
): Promise<ApplicationTask[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(
      includeCompleted
        ? eq(tasks.applicationId, applicationId)
        : and(
            eq(tasks.applicationId, applicationId),
            eq(tasks.isCompleted, false),
          ),
    )
    .orderBy(asc(tasks.dueDate));

  return rows.map((row) => ({
    id: row.id,
    applicationId: row.applicationId,
    type: row.type as ApplicationTaskType,
    title: row.title,
    dueDate: row.dueDate,
    isCompleted: row.isCompleted ?? false,
    notes: row.notes ?? null,
  }));
}

export function transitionStage(
  applicationId: string,
  toStage: ApplicationStage | "no_change",
  occurredAt?: number,
  metadata?: StageEventMetadata | null,
  outcome?: JobOutcome | null,
): StageEvent {
  const parsedMetadata = metadata
    ? stageEventMetadataSchema.parse(metadata)
    : null;

  const now = Math.floor(Date.now() / 1000);
  const timestamp = occurredAt ?? now;

  return db.transaction((tx) => {
    const job = tx.select().from(jobs).where(eq(jobs.id, applicationId)).get();
    if (!job) {
      throw new Error("Job not found");
    }

    const lastEvent = tx
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.applicationId, applicationId))
      .orderBy(desc(stageEvents.occurredAt))
      .limit(1)
      .get();

    const fromStage =
      (lastEvent?.toStage as ApplicationStage | undefined) ?? null;
    const finalToStage =
      toStage === "no_change" ? (fromStage ?? "applied") : toStage;
    const eventId = randomUUID();
    const isNoteEvent = parsedMetadata?.eventType === "note";

    tx.insert(stageEvents)
      .values({
        id: eventId,
        applicationId,
        title: parsedMetadata?.eventLabel ?? finalToStage,
        groupId: parsedMetadata?.groupId ?? null,
        fromStage,
        toStage: finalToStage,
        occurredAt: timestamp,
        metadata: parsedMetadata,
        outcome,
      })
      .run();

    const updates: Partial<typeof jobs.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (toStage !== "no_change" && !isNoteEvent) {
      updates.status = STAGE_TO_STATUS[finalToStage];

      if (finalToStage === "applied" && !job.appliedAt) {
        updates.appliedAt = new Date().toISOString();
      }

      if (finalToStage === "closed") {
        updates.closedAt = timestamp;
      }
    }

    if (outcome) {
      updates.outcome = outcome;
      updates.closedAt = timestamp;
    }

    tx.update(jobs).set(updates).where(eq(jobs.id, applicationId)).run();

    return {
      id: eventId,
      applicationId,
      title: parsedMetadata?.eventLabel ?? finalToStage,
      groupId: parsedMetadata?.groupId ?? null,
      fromStage,
      toStage: finalToStage,
      occurredAt: timestamp,
      metadata: parsedMetadata,
      outcome: outcome ?? null,
    };
  });
}

export function updateStageEvent(
  eventId: string,
  payload: {
    toStage?: ApplicationStage;
    occurredAt?: number;
    metadata?: StageEventMetadata | null;
    outcome?: JobOutcome | null;
  },
): void {
  const { toStage, occurredAt, metadata, outcome } = payload;
  const parsedMetadata = metadata
    ? stageEventMetadataSchema.parse(metadata)
    : undefined;
  const hasOutcome = Object.hasOwn(payload, "outcome");

  db.transaction((tx) => {
    const event = tx
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.id, eventId))
      .get();
    if (!event) throw new Error("Event not found");

    const updates: Partial<typeof stageEvents.$inferInsert> = {};
    if (toStage) updates.toStage = toStage;
    if (occurredAt) updates.occurredAt = occurredAt;
    if (parsedMetadata !== undefined) {
      updates.metadata = parsedMetadata;
      if (parsedMetadata?.eventLabel) updates.title = parsedMetadata.eventLabel;
      if (parsedMetadata?.groupId !== undefined)
        updates.groupId = parsedMetadata.groupId;
    }
    if (hasOutcome) updates.outcome = outcome ?? null;
    if (toStage && !hasOutcome && !isClosingStage(toStage)) {
      updates.outcome = null;
    }

    tx.update(stageEvents)
      .set(updates)
      .where(eq(stageEvents.id, eventId))
      .run();

    // If this was the latest event, update the job status
    const lastEvent = tx
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.applicationId, event.applicationId))
      .orderBy(desc(stageEvents.occurredAt))
      .limit(1)
      .get();

    if (lastEvent && lastEvent.id === eventId) {
      const job = tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, event.applicationId))
        .get();
      if (!job) throw new Error("Job not found");

      const metadata = parseMetadata(lastEvent.metadata);
      const lastStage = lastEvent.toStage as ApplicationStage;
      const { outcome, closedAt } = resolveOutcomeAndClosedAt({
        lastStage,
        lastEventOccurredAt: lastEvent.occurredAt,
        metadata,
        lastEventOutcome: (lastEvent.outcome as JobOutcome | null) ?? null,
        jobOutcome: (job.outcome as JobOutcome | null) ?? null,
        jobClosedAt: job.closedAt ?? null,
      });

      tx.update(jobs)
        .set({
          status: STAGE_TO_STATUS[lastStage],
          outcome,
          closedAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, event.applicationId))
        .run();
    }
  });
}

export function deleteStageEvent(eventId: string): void {
  db.transaction((tx) => {
    const event = tx
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.id, eventId))
      .get();
    if (!event) return;

    tx.delete(stageEvents).where(eq(stageEvents.id, eventId)).run();

    // Update job status based on the new latest event
    const lastEvent = tx
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.applicationId, event.applicationId))
      .orderBy(desc(stageEvents.occurredAt))
      .limit(1)
      .get();

    if (lastEvent) {
      const job = tx
        .select()
        .from(jobs)
        .where(eq(jobs.id, event.applicationId))
        .get();
      if (!job) throw new Error("Job not found");

      const metadata = parseMetadata(lastEvent.metadata);
      const lastStage = lastEvent.toStage as ApplicationStage;
      const { outcome, closedAt } = resolveOutcomeAndClosedAt({
        lastStage,
        lastEventOccurredAt: lastEvent.occurredAt,
        metadata,
        lastEventOutcome: (lastEvent.outcome as JobOutcome | null) ?? null,
        jobOutcome: (job.outcome as JobOutcome | null) ?? null,
        jobClosedAt: job.closedAt ?? null,
      });

      tx.update(jobs)
        .set({
          status: STAGE_TO_STATUS[lastStage],
          outcome,
          closedAt,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, event.applicationId))
        .run();
    } else {
      // If no events left, maybe revert to discovered?
      // For now just keep it as is or set to discovered if it was applied
      tx.update(jobs)
        .set({
          status: "discovered",
          appliedAt: null,
          outcome: null,
          closedAt: null,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(jobs.id, event.applicationId))
        .run();
    }
  });
}

function parseMetadata(raw: unknown): StageEventMetadata | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as StageEventMetadata;
    } catch {
      return null;
    }
  }
  return raw as StageEventMetadata;
}

function inferOutcome(
  toStage: ApplicationStage,
  metadata: StageEventMetadata | null,
): JobOutcome | null {
  if (toStage === "offer") return "offer_accepted";
  if (toStage === "closed" && metadata?.reasonCode) return "rejected";
  return null;
}

function isClosingStage(toStage: ApplicationStage): boolean {
  return toStage === "closed" || toStage === "offer";
}

function resolveOutcomeAndClosedAt(input: {
  lastStage: ApplicationStage;
  lastEventOccurredAt: number;
  metadata: StageEventMetadata | null;
  lastEventOutcome: JobOutcome | null;
  jobOutcome: JobOutcome | null;
  jobClosedAt: number | null;
}): { outcome: JobOutcome | null; closedAt: number | null } {
  const inferredOutcome = inferOutcome(input.lastStage, input.metadata);
  const closingStage = isClosingStage(input.lastStage);
  const outcome =
    input.lastEventOutcome ??
    inferredOutcome ??
    (closingStage ? input.jobOutcome : null);

  if (input.lastStage === "closed") {
    return { outcome, closedAt: input.lastEventOccurredAt };
  }
  if (!outcome) {
    return { outcome, closedAt: null };
  }
  if (input.lastEventOutcome || inferredOutcome) {
    return { outcome, closedAt: input.lastEventOccurredAt };
  }
  return { outcome, closedAt: input.jobClosedAt };
}
