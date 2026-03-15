import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../rxresume", () => ({
  getResume: vi.fn(),
}));

import { getResume } from "../rxresume";

describe.sequential("resumeStudio service", () => {
  const originalEnv = { ...process.env };
  let tempDir = "";
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-resume-studio-test-"));
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      NODE_ENV: "test",
    };

    await import("@server/db/migrate");
    const dbModule = await import("@server/db");
    closeDb = dbModule.closeDb;
  });

  afterEach(async () => {
    closeDb?.();
    closeDb = null;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }

    process.env = { ...originalEnv };
  });

  it("assigns canonical resumes through resume studio and exposes bootstrap data", async () => {
    const dbModule = await import("@server/db");
    const workspacesRepo = await import("@server/repositories/workspaces");
    const resumeStudio = await import("./resumeStudio");

    const workspace = await workspacesRepo.createWorkspace({
      name: "Studio Workspace",
      slug: "studio-workspace",
    });

    await dbModule.db.insert(dbModule.schema.profiles).values([
      {
        id: "profile-default",
        workspaceId: workspace.id,
        label: "Primary",
        isDefault: true,
      },
      {
        id: "profile-second",
        workspaceId: workspace.id,
        label: "Secondary",
        isDefault: false,
      },
    ]);

    const canonical = await resumeStudio.assignCanonicalResume(
      "profile-default",
      "resume-canonical-1",
    );
    const bootstrap = await resumeStudio.getResumeStudioBootstrap(
      workspace.id,
      "profile-default",
    );

    expect(canonical.profileId).toBe("profile-default");
    expect(canonical.rxresumeResumeId).toBe("resume-canonical-1");
    expect(bootstrap.workspace.id).toBe(workspace.id);
    expect(bootstrap.activeProfile?.id).toBe("profile-default");
    expect(bootstrap.profiles).toHaveLength(2);
    expect(bootstrap.canonicalResume).toEqual({
      profileId: "profile-default",
      resumeId: "resume-canonical-1",
      source: "rxresume",
    });
    expect(bootstrap.ownership).toBe("canonical_human_owned");
    expect(bootstrap.latestSnapshot).toBeNull();
  });

  it("creates optional canonical snapshots that stay read-only", async () => {
    const dbModule = await import("@server/db");
    const workspacesRepo = await import("@server/repositories/workspaces");
    const resumeStudio = await import("./resumeStudio");

    const workspace = await workspacesRepo.createWorkspace({
      name: "Snapshot Workspace",
      slug: "snapshot-workspace-service",
    });

    await dbModule.db.insert(dbModule.schema.profiles).values({
      id: "profile-snapshot-service",
      workspaceId: workspace.id,
      label: "Snapshot Profile",
      isDefault: true,
    });

    await resumeStudio.assignCanonicalResume(
      "profile-snapshot-service",
      "resume-snapshot-1",
    );
    vi.mocked(getResume).mockResolvedValue({
      id: "resume-snapshot-1",
      name: "Canonical Resume",
      mode: "v5",
      data: {
        basics: { name: "Test Candidate" },
        sections: { summary: { content: "Canonical" } },
      },
    } as never);

    const snapshot = await resumeStudio.createResumeSnapshotFromCanonical(
      "profile-snapshot-service",
    );

    expect(snapshot.profileId).toBe("profile-snapshot-service");
    expect(snapshot.sourceResumeId).toBe("resume-snapshot-1");
    expect(snapshot.checksum).toMatch(/^sha256:/);

    await expect(
      dbModule.db
        .update(dbModule.schema.resumeSnapshots)
        .set({ checksum: "sha256:mutated" })
        .where(eq(dbModule.schema.resumeSnapshots.id, snapshot.id)),
    ).rejects.toThrow(/immutable|read-only/i);

    await expect(
      dbModule.db
        .delete(dbModule.schema.resumeSnapshots)
        .where(eq(dbModule.schema.resumeSnapshots.id, snapshot.id)),
    ).rejects.toThrow(/immutable|read-only/i);
  });

  it("rejects an explicit profile id that is not in the requested workspace", async () => {
    const dbModule = await import("@server/db");
    const workspacesRepo = await import("@server/repositories/workspaces");
    const resumeStudio = await import("./resumeStudio");

    const workspaceA = await workspacesRepo.createWorkspace({
      name: "Workspace A",
      slug: "workspace-a-bootstrap",
    });
    const workspaceB = await workspacesRepo.createWorkspace({
      name: "Workspace B",
      slug: "workspace-b-bootstrap",
    });

    await dbModule.db.insert(dbModule.schema.profiles).values([
      {
        id: "profile-a",
        workspaceId: workspaceA.id,
        label: "Primary A",
        isDefault: true,
      },
      {
        id: "profile-b",
        workspaceId: workspaceB.id,
        label: "Primary B",
        isDefault: true,
      },
    ]);

    await expect(
      resumeStudio.getResumeStudioBootstrap(workspaceA.id, "profile-b"),
    ).rejects.toThrow(/profile.*workspace/i);
  });
});
