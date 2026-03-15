import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";

const { workspaces } = schema;

export async function createWorkspace(input: {
  name: string;
  slug?: string | null;
}): Promise<typeof workspaces.$inferSelect> {
  const id = randomUUID();
  const now = new Date().toISOString();

  await db.insert(workspaces).values({
    id,
    name: input.name,
    slug: input.slug ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, id));
  if (!workspace) {
    throw new Error(`Failed to create workspace ${id}`);
  }

  return workspace;
}
