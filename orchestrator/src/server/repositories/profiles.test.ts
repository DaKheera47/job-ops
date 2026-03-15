import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("profile repositories", () => {
  const originalEnv = { ...process.env };
  let tempDir = "";
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-profile-repo-test-"));
    process.env = {
      ...originalEnv,
      DATA_DIR: tempDir,
      NODE_ENV: "test",
    };

    await import("../db/migrate");
    const dbModule = await import("../db");
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

  it("switches the default profile within a workspace", async () => {
    const dbModule = await import("../db");
    const workspacesRepo = await import("./workspaces");
    const profilesRepo = await import("./profiles");

    const workspace = await workspacesRepo.createWorkspace({
      name: "Default Workspace",
      slug: "default-workspace",
    });

    await dbModule.db.insert(dbModule.schema.profiles).values([
      {
        id: "profile-default-a",
        workspaceId: workspace.id,
        label: "Primary",
        isDefault: true,
      },
      {
        id: "profile-default-b",
        workspaceId: workspace.id,
        label: "Secondary",
        isDefault: false,
      },
    ]);

    await profilesRepo.setDefaultProfile(workspace.id, "profile-default-b");

    const rows = await dbModule.db
      .select()
      .from(dbModule.schema.profiles)
      .where(eq(dbModule.schema.profiles.workspaceId, workspace.id));

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === "profile-default-a")?.isDefault).toBe(
      false,
    );
    expect(rows.find((row) => row.id === "profile-default-b")?.isDefault).toBe(
      true,
    );
  });

  it("keeps one canonical resume per profile while allowing many derived variants", async () => {
    const dbModule = await import("../db");
    const workspacesRepo = await import("./workspaces");
    const profilesRepo = await import("./profiles");
    const variantsRepo = await import("./resumeVariants");

    const workspace = await workspacesRepo.createWorkspace({
      name: "Resume Workspace",
      slug: "resume-workspace",
    });

    await dbModule.db.insert(dbModule.schema.profiles).values({
      id: "profile-canonical",
      workspaceId: workspace.id,
      label: "Canonical",
      isDefault: true,
    });
    await dbModule.db.insert(dbModule.schema.jobs).values([
      {
        id: "job-variant-1",
        source: "manual",
        title: "Platform Engineer",
        employer: "Acme",
        jobUrl: "https://example.com/jobs/platform-engineer",
      },
      {
        id: "job-variant-2",
        source: "manual",
        title: "Staff Engineer",
        employer: "Acme",
        jobUrl: "https://example.com/jobs/staff-engineer",
      },
    ]);

    const firstCanonical = await profilesRepo.setCanonicalResume({
      workspaceId: workspace.id,
      profileId: "profile-canonical",
      rxresumeResumeId: "resume-v1",
    });
    const updatedCanonical = await profilesRepo.setCanonicalResume({
      workspaceId: workspace.id,
      profileId: "profile-canonical",
      rxresumeResumeId: "resume-v2",
    });

    const firstVariant = await variantsRepo.createDerivedVariant({
      workspaceId: workspace.id,
      profileId: "profile-canonical",
      jobId: "job-variant-1",
      sourceResumeId: updatedCanonical.rxresumeResumeId,
      status: "pending",
      pdfPath: null,
    });
    const secondVariant = await variantsRepo.createDerivedVariant({
      workspaceId: workspace.id,
      profileId: "profile-canonical",
      jobId: "job-variant-2",
      sourceResumeId: updatedCanonical.rxresumeResumeId,
      status: "ready",
      pdfPath: "/tmp/variant.pdf",
    });

    const canonicalRows = await dbModule.db
      .select()
      .from(dbModule.schema.canonicalResumes)
      .where(
        eq(dbModule.schema.canonicalResumes.profileId, "profile-canonical"),
      );
    const variantRows = await dbModule.db
      .select()
      .from(dbModule.schema.derivedResumeVariants)
      .where(
        eq(
          dbModule.schema.derivedResumeVariants.profileId,
          "profile-canonical",
        ),
      );

    expect(firstCanonical.id).toBe(updatedCanonical.id);
    expect(canonicalRows).toHaveLength(1);
    expect(canonicalRows[0]?.rxresumeResumeId).toBe("resume-v2");
    expect(variantRows).toHaveLength(2);
    expect([firstVariant.id, secondVariant.id]).toEqual(
      expect.arrayContaining(variantRows.map((row) => row.id)),
    );
  });

  it("keeps snapshots immutable and read-only once written", async () => {
    const dbModule = await import("../db");
    const workspacesRepo = await import("./workspaces");
    const snapshotsRepo = await import("./resumeSnapshots");

    const workspace = await workspacesRepo.createWorkspace({
      name: "Snapshot Workspace",
      slug: "snapshot-workspace",
    });

    await dbModule.db.insert(dbModule.schema.profiles).values({
      id: "profile-snapshot",
      workspaceId: workspace.id,
      label: "Snapshot",
      isDefault: true,
    });

    const snapshot = await snapshotsRepo.createSnapshot({
      workspaceId: workspace.id,
      profileId: "profile-snapshot",
      sourceResumeId: "resume-source-1",
      format: "json",
      checksum: "sha256:original",
      payload: JSON.stringify({ basics: { name: "A. Candidate" } }),
    });

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

    const [storedSnapshot] = await dbModule.db
      .select()
      .from(dbModule.schema.resumeSnapshots)
      .where(eq(dbModule.schema.resumeSnapshots.id, snapshot.id));

    expect(storedSnapshot?.checksum).toBe("sha256:original");
    expect(storedSnapshot?.payload).toBe(
      JSON.stringify({ basics: { name: "A. Candidate" } }),
    );
  });

  it("rejects child rows whose profile belongs to a different workspace", async () => {
    const dbModule = await import("../db");
    const workspacesRepo = await import("./workspaces");

    const workspaceA = await workspacesRepo.createWorkspace({
      name: "Workspace A",
      slug: "workspace-a",
    });
    const workspaceB = await workspacesRepo.createWorkspace({
      name: "Workspace B",
      slug: "workspace-b",
    });

    await dbModule.db.insert(dbModule.schema.profiles).values([
      {
        id: "profile-a",
        workspaceId: workspaceA.id,
        label: "Profile A",
        isDefault: true,
      },
      {
        id: "profile-b",
        workspaceId: workspaceB.id,
        label: "Profile B",
        isDefault: true,
      },
    ]);
    await dbModule.db.insert(dbModule.schema.jobs).values({
      id: "job-cross-workspace",
      source: "manual",
      title: "Cross Workspace Job",
      employer: "Acme",
      jobUrl: "https://example.com/jobs/cross-workspace",
    });

    await expect(
      dbModule.db.insert(dbModule.schema.canonicalResumes).values({
        id: "canonical-cross",
        workspaceId: workspaceA.id,
        profileId: "profile-b",
        source: "rxresume",
        rxresumeResumeId: "resume-cross",
      }),
    ).rejects.toThrow();

    await expect(
      dbModule.db.insert(dbModule.schema.derivedResumeVariants).values({
        id: "variant-cross",
        workspaceId: workspaceA.id,
        profileId: "profile-b",
        jobId: "job-cross-workspace",
        sourceResumeId: "resume-cross",
        status: "pending",
      }),
    ).rejects.toThrow();

    await expect(
      dbModule.db.insert(dbModule.schema.resumeSnapshots).values({
        id: "snapshot-cross",
        workspaceId: workspaceA.id,
        profileId: "profile-b",
        sourceResumeId: "resume-cross",
        format: "json",
        checksum: "sha256:cross",
        payload: "{}",
      }),
    ).rejects.toThrow();
  });
});
