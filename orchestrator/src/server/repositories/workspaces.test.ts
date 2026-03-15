import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("workspace repositories", () => {
  const originalEnv = { ...process.env };
  let tempDir = "";
  let closeDb: (() => void) | null = null;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-workspace-repo-test-"));
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

  it("requires every profile to belong to an existing workspace", async () => {
    const dbModule = await import("../db");

    await expect(
      dbModule.db.insert(dbModule.schema.profiles).values({
        id: "profile-missing-workspace",
        workspaceId: "workspace-missing",
        label: "No Workspace",
        isDefault: false,
      }),
    ).rejects.toThrow();
  });

  it("lists multiple profiles for one workspace", async () => {
    const dbModule = await import("../db");
    const workspacesRepo = await import("./workspaces");
    const profilesRepo = await import("./profiles");

    const workspace = await workspacesRepo.createWorkspace({
      name: "Primary Workspace",
      slug: "primary-workspace",
    });
    const otherWorkspace = await workspacesRepo.createWorkspace({
      name: "Other Workspace",
      slug: "other-workspace",
    });

    await dbModule.db.insert(dbModule.schema.profiles).values([
      {
        id: "profile-1",
        workspaceId: workspace.id,
        label: "Platform",
        isDefault: true,
      },
      {
        id: "profile-2",
        workspaceId: workspace.id,
        label: "Consulting",
        isDefault: false,
      },
      {
        id: "profile-3",
        workspaceId: otherWorkspace.id,
        label: "Ignored",
        isDefault: true,
      },
    ]);

    const profiles = await profilesRepo.listProfilesByWorkspace(workspace.id);

    expect(profiles).toHaveLength(2);
    expect(profiles.map((profile) => profile.id)).toEqual([
      "profile-1",
      "profile-2",
    ]);
    expect(
      profiles.every((profile) => profile.workspaceId === workspace.id),
    ).toBe(true);
  });

  it("rejects more than one default profile in the same workspace", async () => {
    const dbModule = await import("../db");
    const workspacesRepo = await import("./workspaces");

    const workspace = await workspacesRepo.createWorkspace({
      name: "Single Default Workspace",
      slug: "single-default-workspace",
    });

    await dbModule.db.insert(dbModule.schema.profiles).values({
      id: "profile-default-1",
      workspaceId: workspace.id,
      label: "First Default",
      isDefault: true,
    });

    await expect(
      dbModule.db.insert(dbModule.schema.profiles).values({
        id: "profile-default-2",
        workspaceId: workspace.id,
        label: "Second Default",
        isDefault: true,
      }),
    ).rejects.toThrow();
  });
});
