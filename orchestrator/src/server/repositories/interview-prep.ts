/**
 * Interview prep repository — Story Bank (STAR+R) + Question/Answer bank.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db/index";
import { getActiveTenantId } from "../tenancy/context";

const { interviewStories, interviewQuestions } = schema;

export interface InterviewStory {
  id: string;
  title: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
  tags: string[];
  sourceJobId: string | null;
  timesUsed: number;
  isMaster: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InterviewQuestion {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  sourceJobId: string | null;
  sourceCompany: string | null;
  timesAsked: number;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

function safeParseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    /* fallthrough */
  }
  return [];
}

function mapRowToStory(
  row: typeof interviewStories.$inferSelect,
): InterviewStory {
  return {
    id: row.id,
    title: row.title,
    situation: row.situation,
    task: row.task,
    action: row.action,
    result: row.result,
    reflection: row.reflection,
    tags: safeParseTags(row.tags),
    sourceJobId: row.sourceJobId ?? null,
    timesUsed: row.timesUsed,
    isMaster: Boolean(row.isMaster),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRowToQuestion(
  row: typeof interviewQuestions.$inferSelect,
): InterviewQuestion {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    tags: safeParseTags(row.tags),
    sourceJobId: row.sourceJobId ?? null,
    sourceCompany: row.sourceCompany ?? null,
    timesAsked: row.timesAsked,
    confidence: row.confidence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------- Stories ----------

export async function listStories(limit = 50): Promise<InterviewStory[]> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select()
    .from(interviewStories)
    .where(eq(interviewStories.tenantId, tenantId))
    .orderBy(desc(interviewStories.updatedAt))
    .limit(limit);
  return rows.map(mapRowToStory);
}

export async function getStoryById(id: string): Promise<InterviewStory | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(interviewStories)
    .where(
      and(eq(interviewStories.tenantId, tenantId), eq(interviewStories.id, id)),
    );
  return row ? mapRowToStory(row) : null;
}

export async function createStory(input: {
  title: string;
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
  reflection?: string;
  tags?: string[];
  sourceJobId?: string | null;
  isMaster?: boolean;
}): Promise<InterviewStory> {
  const tenantId = getActiveTenantId();
  const id = randomUUID();
  await db.insert(interviewStories).values({
    id,
    tenantId,
    title: input.title,
    situation: input.situation ?? "",
    task: input.task ?? "",
    action: input.action ?? "",
    result: input.result ?? "",
    reflection: input.reflection ?? "",
    tags: JSON.stringify(input.tags ?? []),
    sourceJobId: input.sourceJobId ?? null,
    isMaster: input.isMaster ?? false,
  });
  const story = await getStoryById(id);
  if (!story) throw new Error("Failed to create story");
  return story;
}

export async function updateStory(
  id: string,
  patch: Partial<{
    title: string;
    situation: string;
    task: string;
    action: string;
    result: string;
    reflection: string;
    tags: string[];
    isMaster: boolean;
    timesUsed: number;
  }>,
): Promise<InterviewStory | null> {
  const tenantId = getActiveTenantId();
  const now = new Date().toISOString();
  await db
    .update(interviewStories)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.situation !== undefined ? { situation: patch.situation } : {}),
      ...(patch.task !== undefined ? { task: patch.task } : {}),
      ...(patch.action !== undefined ? { action: patch.action } : {}),
      ...(patch.result !== undefined ? { result: patch.result } : {}),
      ...(patch.reflection !== undefined
        ? { reflection: patch.reflection }
        : {}),
      ...(patch.tags !== undefined
        ? { tags: JSON.stringify(patch.tags) }
        : {}),
      ...(patch.isMaster !== undefined ? { isMaster: patch.isMaster } : {}),
      ...(patch.timesUsed !== undefined ? { timesUsed: patch.timesUsed } : {}),
      updatedAt: now,
    })
    .where(
      and(eq(interviewStories.tenantId, tenantId), eq(interviewStories.id, id)),
    );
  return getStoryById(id);
}

export async function deleteStory(id: string): Promise<boolean> {
  const tenantId = getActiveTenantId();
  const result = await db
    .delete(interviewStories)
    .where(
      and(eq(interviewStories.tenantId, tenantId), eq(interviewStories.id, id)),
    )
    .run();
  return result.changes > 0;
}

// ---------- Questions ----------

export async function listQuestions(
  limit = 50,
): Promise<InterviewQuestion[]> {
  const tenantId = getActiveTenantId();
  const rows = await db
    .select()
    .from(interviewQuestions)
    .where(eq(interviewQuestions.tenantId, tenantId))
    .orderBy(desc(interviewQuestions.updatedAt))
    .limit(limit);
  return rows.map(mapRowToQuestion);
}

export async function getQuestionById(
  id: string,
): Promise<InterviewQuestion | null> {
  const tenantId = getActiveTenantId();
  const [row] = await db
    .select()
    .from(interviewQuestions)
    .where(
      and(
        eq(interviewQuestions.tenantId, tenantId),
        eq(interviewQuestions.id, id),
      ),
    );
  return row ? mapRowToQuestion(row) : null;
}

export async function createQuestion(input: {
  question: string;
  answer?: string;
  tags?: string[];
  sourceJobId?: string | null;
  sourceCompany?: string | null;
  confidence?: number;
}): Promise<InterviewQuestion> {
  const tenantId = getActiveTenantId();
  const id = randomUUID();
  await db.insert(interviewQuestions).values({
    id,
    tenantId,
    question: input.question,
    answer: input.answer ?? "",
    tags: JSON.stringify(input.tags ?? []),
    sourceJobId: input.sourceJobId ?? null,
    sourceCompany: input.sourceCompany ?? null,
    confidence: input.confidence ?? 3,
  });
  const q = await getQuestionById(id);
  if (!q) throw new Error("Failed to create question");
  return q;
}

export async function updateQuestion(
  id: string,
  patch: Partial<{
    question: string;
    answer: string;
    tags: string[];
    confidence: number;
    timesAsked: number;
  }>,
): Promise<InterviewQuestion | null> {
  const tenantId = getActiveTenantId();
  const now = new Date().toISOString();
  await db
    .update(interviewQuestions)
    .set({
      ...(patch.question !== undefined ? { question: patch.question } : {}),
      ...(patch.answer !== undefined ? { answer: patch.answer } : {}),
      ...(patch.tags !== undefined
        ? { tags: JSON.stringify(patch.tags) }
        : {}),
      ...(patch.confidence !== undefined
        ? { confidence: patch.confidence }
        : {}),
      ...(patch.timesAsked !== undefined
        ? { timesAsked: patch.timesAsked }
        : {}),
      updatedAt: now,
    })
    .where(
      and(
        eq(interviewQuestions.tenantId, tenantId),
        eq(interviewQuestions.id, id),
      ),
    );
  return getQuestionById(id);
}

export async function deleteQuestion(id: string): Promise<boolean> {
  const tenantId = getActiveTenantId();
  const result = await db
    .delete(interviewQuestions)
    .where(
      and(
        eq(interviewQuestions.tenantId, tenantId),
        eq(interviewQuestions.id, id),
      ),
    )
    .run();
  return result.changes > 0;
}
