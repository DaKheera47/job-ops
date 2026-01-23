import { randomUUID } from 'crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { db, schema } from '../db/index.js';
import type {
  ApplicationStage,
  ApplicationTask,
  ApplicationTaskType,
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
  interview: 'applied',
  offer: 'applied',
  rejected: 'applied',
  withdrawn: 'applied',
  closed: 'applied',
};

export const stageEventMetadataSchema = z.object({
  note: z.string().nullable().optional(),
  actor: z.enum(['system', 'user']).optional(),
  groupId: z.string().nullable().optional(),
  groupLabel: z.string().nullable().optional(),
  eventLabel: z.string().nullable().optional(),
  externalUrl: z.string().url().nullable().optional(),
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
    metadata: (row.metadata ?? null) as StageEventMetadata | null,
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
    dueDate: row.dueDate,
    isCompleted: row.isCompleted ?? false,
    notes: row.notes ?? null,
  }));
}

export async function transitionStage(
  applicationId: string,
  toStage: ApplicationStage,
  metadata?: StageEventMetadata | null,
): Promise<StageEvent> {
  z.object({
    applicationId: z.string().min(1),
    toStage: z.enum(APPLICATION_STAGES),
  }).parse({ applicationId, toStage });
  const parsedMetadata = metadata ? stageEventMetadataSchema.parse(metadata) : null;

  const now = Math.floor(Date.now() / 1000);

  return db.transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, applicationId));
    if (!job) {
      throw new Error('Job not found');
    }

    const [lastEvent] = await tx
      .select()
      .from(stageEvents)
      .where(eq(stageEvents.applicationId, applicationId))
      .orderBy(desc(stageEvents.occurredAt))
      .limit(1);

    const fromStage = (lastEvent?.toStage as ApplicationStage | undefined) ?? null;
    const eventId = randomUUID();

    await tx.insert(stageEvents).values({
      id: eventId,
      applicationId,
      fromStage,
      toStage,
      occurredAt: now,
      metadata: parsedMetadata ?? null,
    });

    const updates: Partial<typeof jobs.$inferInsert> = {
      status: STAGE_TO_STATUS[toStage],
    };

    if (toStage === 'applied' && !job.appliedAt) {
      updates.appliedAt = new Date().toISOString();
    }

    await tx.update(jobs).set(updates).where(eq(jobs.id, applicationId));

    const autoTasks = buildAutoTasks(applicationId, toStage, now);
    if (autoTasks.length > 0) {
      await tx.insert(tasks).values(autoTasks);
    }

    return {
      id: eventId,
      applicationId,
      fromStage,
      toStage,
      occurredAt: now,
      metadata: parsedMetadata ?? null,
    };
  });
}

function buildAutoTasks(applicationId: string, stage: ApplicationStage, now: number) {
  const tasksToCreate: Array<typeof tasks.$inferInsert> = [];

  if (stage === 'applied') {
    tasksToCreate.push({
      id: randomUUID(),
      applicationId,
      type: 'follow_up',
      dueDate: now + 7 * 24 * 60 * 60,
      isCompleted: false,
      notes: 'Follow up on application status.',
    });
  }

  if (stage === 'recruiter_screen') {
    tasksToCreate.push({
      id: randomUUID(),
      applicationId,
      type: 'send_docs',
      dueDate: now + 24 * 60 * 60,
      isCompleted: false,
      notes: 'Send requested documents or prep materials.',
    });
  }

  return tasksToCreate;
}
