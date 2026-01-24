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
  toStage: ApplicationStage,
  occurredAt?: number,
  metadata?: StageEventMetadata | null,
  outcome?: JobOutcome | null,
  actionId?: string,
): StageEvent {
  z.object({
    applicationId: z.string().min(1),
    toStage: z.enum(APPLICATION_STAGES),
  }).parse({ applicationId, toStage });
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
    const inferredStage = toStage ?? fromStage ?? 'applied';
    const withGroup = ensureAssessmentGroup({
      stage: inferredStage,
      metadata: parsedMetadata,
      lastAssessmentGroupId: getLastAssessmentGroupId(tx, applicationId),
      timestamp,
    });
    const eventId = randomUUID();

    tx.insert(stageEvents).values({
      id: eventId,
      applicationId,
      fromStage,
      toStage: inferredStage,
      occurredAt: timestamp,
      metadata: withGroup,
    }).run();

    const updates: Partial<typeof jobs.$inferInsert> = {
      status: STAGE_TO_STATUS[inferredStage],
    };

    if (inferredStage === 'applied' && !job.appliedAt) {
      updates.appliedAt = new Date().toISOString();
    }

    if (outcome) {
      updates.outcome = outcome;
      updates.closedAt = outcome === 'ghosted'
        ? getLastEventTimestamp(tx, applicationId)
        : timestamp;
    }

    tx.update(jobs).set(updates).where(eq(jobs.id, applicationId)).run();

    const autoTasks = buildAutoTasks(tx, applicationId, inferredStage, timestamp, metadata, actionId);
    if (autoTasks.length > 0) {
      tx.insert(tasks).values(autoTasks).run();
    }

    return {
      id: eventId,
      applicationId,
      fromStage,
      toStage: inferredStage,
      occurredAt: timestamp,
      metadata: withGroup,
    };
  });
}

function buildAutoTasks(
  tx: typeof db,
  applicationId: string,
  stage: ApplicationStage,
  timestamp: number,
  metadata?: StageEventMetadata | null,
  actionId?: string,
) {
  const tasksToCreate: Array<typeof tasks.$inferInsert> = [];

  const createTask = (input: {
    type: ApplicationTaskType;
    title: string;
    dueDate: number | null;
    notes?: string | null;
  }) => {
    if (hasOpenTask(tx, applicationId, input.type)) return;
    tasksToCreate.push({
      id: randomUUID(),
      applicationId,
      type: input.type,
      title: input.title,
      dueDate: input.dueDate,
      isCompleted: false,
      notes: input.notes ?? null,
    });
  };

  if (actionId === 'book_recruiter_screen') {
    createTask({
      type: 'prep',
      title: 'Prep for Recruiter Call',
      dueDate: timestamp - 24 * 60 * 60,
    });
  }

  if (actionId === 'log_oa_received') {
    createTask({
      type: 'todo',
      title: 'Complete Assessment',
      dueDate: timestamp + 3 * 24 * 60 * 60,
    });
  }

  if (actionId === 'log_screen_completed') {
    createTask({
      type: 'follow_up',
      title: 'Send Thank You Note',
      dueDate: timestamp + 24 * 60 * 60,
    });
  }

  if (actionId === 'log_oa_submitted') {
    createTask({
      type: 'check_status',
      title: 'Check Assessment Status',
      dueDate: timestamp + 7 * 24 * 60 * 60,
    });
  }

  if (actionId === 'book_interview_round') {
    createTask({
      type: 'prep',
      title: 'Prep for Interview',
      dueDate: timestamp - 2 * 24 * 60 * 60,
    });
  }

  return tasksToCreate;
}

function hasOpenTask(tx: any, applicationId: string, type: ApplicationTaskType) {
  const task = tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.applicationId, applicationId), eq(tasks.type, type), eq(tasks.isCompleted, false)))
    .get();
  return Boolean(task);
}

function getLastAssessmentGroupId(tx: any, applicationId: string) {
  const row = tx
    .select({ metadata: stageEvents.metadata })
    .from(stageEvents)
    .where(and(eq(stageEvents.applicationId, applicationId), eq(stageEvents.toStage, 'assessment')))
    .orderBy(desc(stageEvents.occurredAt))
    .get();

  const metadata = parseMetadata(row?.metadata);
  return metadata?.groupId ?? null;
}

function ensureAssessmentGroup(input: {
  stage: ApplicationStage;
  metadata: StageEventMetadata | null;
  lastAssessmentGroupId: string | null;
  timestamp: number;
}) {
  if (input.stage !== 'assessment') {
    return input.metadata ?? null;
  }

  const groupId = input.metadata?.groupId ?? input.lastAssessmentGroupId ?? `oa_${input.timestamp}`;
  return {
    ...(input.metadata ?? {}),
    groupId,
    groupLabel: input.metadata?.groupLabel ?? 'Online assessment',
  } satisfies StageEventMetadata;
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
