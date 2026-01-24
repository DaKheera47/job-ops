import { randomUUID } from 'crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, schema } from '../db/index.js';
import type {
  ApplicationStage,
  ApplicationTask,
  ApplicationTaskType,
  JobOutcome,
  JobStatus,
  StageEvent,
  StageEventMetadata,
} from '../../shared/types.js';
import { APPLICATION_STAGES } from '../../shared/types.js';

const { jobs, stageEvents, tasks } = schema;

const STAGE_TO_STATUS: Record<ApplicationStage, JobStatus> = {
  applied: 'applied',
  recruiter_screen: 'applied',
  assessment: 'applied',
  hiring_manager_screen: 'applied',
  technical_interview: 'applied',
  onsite: 'applied',
  offer: 'applied',
  closed: 'applied',
};

export const stageEventMetadataSchema = z.object({
  note: z.string().nullable().optional(),
  actor: z.enum(['system', 'user']).optional(),
  groupId: z.string().nullable().optional(),
  groupLabel: z.string().nullable().optional(),
  eventLabel: z.string().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
  reasonCode: z.string().nullable().optional(),
  eventType: z.enum(['interview_log', 'status_update', 'note']).nullable().optional(),
}).strict();

export async function getStageEvents(applicationId: string): Promise<StageEvent[]> {
  const rows = await db
    .select()
    .from(stageEvents)
    .where(eq(stageEvents.applicationId, applicationId))
    .orderBy(asc(stageEvents.occurredAt));

  return rows.map((row) => ({
    id: row.id,
    applicationId: row.applicationId,
    fromStage: row.fromStage as ApplicationStage | null,
    toStage: row.toStage as ApplicationStage,
    occurredAt: row.occurredAt,
    metadata: parseMetadata(row.metadata),
  }));
}

export async function getTasks(applicationId: string, includeCompleted = false): Promise<ApplicationTask[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(
      includeCompleted
        ? eq(tasks.applicationId, applicationId)
        : and(eq(tasks.applicationId, applicationId), eq(tasks.isCompleted, false)),
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
  toStage: ApplicationStage | 'no_change',
  occurredAt?: number,
  metadata?: StageEventMetadata | null,
  outcome?: JobOutcome | null,
): StageEvent {
  const parsedMetadata = metadata ? stageEventMetadataSchema.parse(metadata) : null;

  const now = Math.floor(Date.now() / 1000);
  const timestamp = occurredAt ?? now;

  return db.transaction((tx: any) => {
    const job = tx.select().from(jobs).where(eq(jobs.id, applicationId)).get();
    if (!job) {
      throw new Error('Job not found');
    }

    const lastEvent = tx
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.applicationId, applicationId))
      .orderBy(desc(stageEvents.occurredAt))
      .limit(1)
      .get();

    const fromStage = (lastEvent?.toStage as ApplicationStage | undefined) ?? null;
    const finalToStage = toStage === 'no_change' ? (fromStage ?? 'applied') : toStage;
    const eventId = randomUUID();

    tx.insert(stageEvents).values({
      id: eventId,
      applicationId,
      fromStage,
      toStage: finalToStage,
      occurredAt: timestamp,
      metadata: parsedMetadata,
    }).run();

    const updates: Partial<typeof jobs.$inferInsert> = {
      updatedAt: new Date().toISOString(),
    };

    if (toStage !== 'no_change') {
      updates.status = STAGE_TO_STATUS[finalToStage];

      if (finalToStage === 'applied' && !job.appliedAt) {
        updates.appliedAt = new Date().toISOString();
      }
    }

    if (outcome) {
      updates.outcome = outcome;
      updates.closedAt = outcome === 'ghosted'
        ? getLastEventTimestamp(tx, applicationId)
        : timestamp;
    }

    tx.update(jobs).set(updates).where(eq(jobs.id, applicationId)).run();

    return {
      id: eventId,
      applicationId,
      fromStage,
      toStage: finalToStage,
      occurredAt: timestamp,
      metadata: parsedMetadata,
    };
  });
}

function parseMetadata(raw: unknown): StageEventMetadata | null {
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as StageEventMetadata;
    } catch {
      return null;
    }
  }
  return raw as StageEventMetadata;
}

function getLastEventTimestamp(tx: any, applicationId: string) {
  const row = tx
    .select({ occurredAt: stageEvents.occurredAt })
    .from(stageEvents)
    .where(eq(stageEvents.applicationId, applicationId))
    .orderBy(desc(stageEvents.occurredAt))
    .get();
  return row?.occurredAt ?? Math.floor(Date.now() / 1000);
}
