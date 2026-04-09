import type { DesignResumeJson } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultReactiveResumeDocument } from "./rxresume/document";

const repo = vi.hoisted(() => ({
  getLatestDesignResumeDocument: vi.fn(),
  listDesignResumeAssets: vi.fn(),
  upsertDesignResumeDocument: vi.fn(),
  insertDesignResumeAsset: vi.fn(),
  deleteDesignResumeAssetsForDocument: vi.fn(),
  findDesignResumeAssetForDocument: vi.fn(),
  deleteDesignResumeAsset: vi.fn(),
}));

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@server/repositories/design-resume", () => repo);
vi.mock("@server/config/dataDir", () => ({
  getDataDir: vi.fn(() => "/tmp/job-ops-test"),
}));
vi.mock("@paralleldrive/cuid2", () => ({
  createId: vi.fn(() => "asset-1"),
}));
vi.mock("@server/services/rxresume/baseResumeId", () => ({
  getConfiguredRxResumeBaseResumeId: vi.fn(),
}));
vi.mock("@server/services/rxresume", () => ({
  getResume: vi.fn(),
}));
vi.mock("@server/services/rxresume/schema/v4", () => ({
  parseV4ResumeData: vi.fn((input: unknown) => input),
}));
vi.mock("@server/services/tracer-links", () => ({
  resolveTracerPublicBaseUrl: vi.fn(() => null),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => true),
  default: {
    existsSync: vi.fn(() => true),
  },
}));
vi.mock("node:fs/promises", () => ({
  ...fsMocks,
  default: fsMocks,
}));

import { getResume } from "@server/services/rxresume";
import { getConfiguredRxResumeBaseResumeId } from "@server/services/rxresume/baseResumeId";
import {
  getCurrentDesignResume,
  importDesignResumeFromReactiveResume,
  updateCurrentDesignResume,
  uploadDesignResumePicture,
} from "./design-resume";

function makeDocumentRow(overrides?: Partial<Record<string, unknown>>) {
  const defaultResume = buildDefaultReactiveResumeDocument();
  (defaultResume.basics as Record<string, unknown>).name = "Test User";

  return {
    id: "primary",
    title: "Test Resume",
    resumeJson: defaultResume,
    revision: 1,
    sourceResumeId: null,
    sourceMode: "v5",
    importedAt: null,
    createdAt: "2026-04-07T00:00:00.000Z",
    updatedAt: "2026-04-07T00:00:00.000Z",
    ...overrides,
  };
}

function makeValidResumeJson(
  overrides?: Partial<Record<string, unknown>>,
): DesignResumeJson {
  return {
    ...buildDefaultReactiveResumeDocument(),
    ...overrides,
  } as DesignResumeJson;
}

describe("design resume service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.getLatestDesignResumeDocument.mockResolvedValue(makeDocumentRow());
    repo.listDesignResumeAssets.mockResolvedValue([]);
    repo.upsertDesignResumeDocument.mockImplementation(async (input) =>
      makeDocumentRow({
        ...input,
        createdAt: "2026-04-07T00:00:00.000Z",
      }),
    );
    repo.findDesignResumeAssetForDocument.mockResolvedValue(null);
    repo.insertDesignResumeAsset.mockResolvedValue({ id: "asset-1" });
    vi.mocked(getConfiguredRxResumeBaseResumeId).mockResolvedValue({
      mode: "v5",
      resumeId: "rx-1",
    });
    vi.mocked(getResume).mockResolvedValue({
      id: "rx-1",
      mode: "v5",
      data: makeDocumentRow().resumeJson,
    } as never);
  });

  it("rejects replace patches that target a missing array index", async () => {
    await expect(
      updateCurrentDesignResume({
        baseRevision: 1,
        operations: [
          {
            op: "replace",
            path: "/sections/projects/items/0",
            value: { id: "p1" },
          },
        ],
      }),
    ).rejects.toThrow("Invalid array patch path");
  });

  it("preserves an explicit picture hidden flag during updates", async () => {
    const resumeJson = makeValidResumeJson();
    repo.getLatestDesignResumeDocument.mockResolvedValueOnce(
      makeDocumentRow({
        resumeJson: {
          ...resumeJson,
          picture: {
            ...(resumeJson.picture as Record<string, unknown>),
            hidden: true,
          },
        },
      }),
    );

    const updated = await updateCurrentDesignResume({
      baseRevision: 1,
      document: {
        ...resumeJson,
        picture: {
          ...(resumeJson.picture as Record<string, unknown>),
          hidden: true,
        } as (typeof resumeJson)["picture"],
      },
    });

    expect(
      (
        updated.resumeJson.picture as {
          hidden?: boolean;
        }
      ).hidden,
    ).toBe(true);
  });

  it("uses structural equality for patch test operations", async () => {
    await expect(
      updateCurrentDesignResume({
        baseRevision: 1,
        operations: [
          {
            op: "test",
            path: "/basics/website",
            value: { label: "", url: "" },
          },
        ],
      }),
    ).resolves.toBeTruthy();
  });

  it("accepts upstream v5 resumes without wrapper fields or item options", async () => {
    const upstreamResume = makeValidResumeJson({
      sections: {
        ...(buildDefaultReactiveResumeDocument().sections as Record<
          string,
          unknown
        >),
        profiles: {
          title: "",
          columns: 1,
          hidden: false,
          items: [
            {
              id: "profile-1",
              hidden: false,
              icon: "github-logo",
              network: "GitHub",
              username: "user",
              website: { url: "https://github.com/user", label: "" },
            },
          ],
        },
        projects: {
          title: "",
          columns: 1,
          hidden: false,
          items: [
            {
              id: "project-1",
              hidden: false,
              name: "Project",
              period: "2026",
              website: { url: "", label: "" },
              description: "<p>Example</p>",
            },
          ],
        },
      },
    });

    vi.mocked(getResume).mockResolvedValueOnce({
      id: "rx-1",
      mode: "v5",
      data: upstreamResume,
    } as never);

    const result = await importDesignResumeFromReactiveResume();

    expect(result.resumeJson).not.toHaveProperty("$schema");
    expect(result.resumeJson).not.toHaveProperty("version");
    expect(result.resumeJson.sections.projects.items[0]).not.toHaveProperty(
      "options",
    );
    expect(result.resumeJson.sections.profiles.items[0]).not.toHaveProperty(
      "options",
    );
  });

  it("rejects legacy local documents and requires re-import", async () => {
    repo.getLatestDesignResumeDocument.mockResolvedValueOnce(
      makeDocumentRow({
        resumeJson: {
          basics: {
            name: "Legacy User",
            headline: "",
            email: "",
            phone: "",
            location: "",
            website: { label: "", url: "" },
            customFields: [],
          },
          picture: { url: "", show: false },
          summary: {
            title: "Summary",
            columns: 1,
            hidden: false,
            content: "",
          },
          sections: {
            profiles: {
              title: "Profiles",
              columns: 1,
              hidden: false,
              items: [],
            },
            experience: {
              title: "Experience",
              columns: 1,
              hidden: false,
              items: [],
            },
            education: {
              title: "Education",
              columns: 1,
              hidden: false,
              items: [],
            },
            projects: {
              title: "Projects",
              columns: 1,
              hidden: false,
              items: [],
            },
            skills: { title: "Skills", columns: 1, hidden: false, items: [] },
            languages: {
              title: "Languages",
              columns: 1,
              hidden: false,
              items: [],
            },
            interests: {
              title: "Interests",
              columns: 1,
              hidden: false,
              items: [],
            },
            awards: { title: "Awards", columns: 1, hidden: false, items: [] },
            certifications: {
              title: "Certifications",
              columns: 1,
              hidden: false,
              items: [],
            },
            publications: {
              title: "Publications",
              columns: 1,
              hidden: false,
              items: [],
            },
            volunteer: {
              title: "Volunteer",
              columns: 1,
              hidden: false,
              items: [],
            },
            references: {
              title: "References",
              columns: 1,
              hidden: false,
              items: [],
            },
          },
          customSections: [],
          metadata: {
            layout: [[["summary"], ["skills"]]],
          },
        },
      }),
    );

    await expect(getCurrentDesignResume()).rejects.toThrow(
      "Stored Design Resume is no longer compatible. Re-import from Reactive Resume v5 to continue.",
    );
  });

  it("cleans up the uploaded file when picture asset insertion fails", async () => {
    repo.insertDesignResumeAsset.mockRejectedValue(
      new Error("db insert failed"),
    );

    await expect(
      uploadDesignResumePicture({
        fileName: "photo.png",
        dataUrl: `data:image/png;base64,${Buffer.from("hello").toString("base64")}`,
      }),
    ).rejects.toThrow("db insert failed");

    expect(fsMocks.unlink).toHaveBeenCalledWith(
      "/tmp/job-ops-test/design-resume/assets/asset-1.png",
    );
  });

  it("removes existing assets when re-importing from Reactive Resume", async () => {
    repo.listDesignResumeAssets
      .mockResolvedValueOnce([
        {
          id: "old-picture",
          documentId: "primary",
          kind: "picture",
          originalName: "old.png",
          mimeType: "image/png",
          byteSize: 123,
          storagePath: "/tmp/job-ops-test/design-resume/assets/old-picture.png",
          createdAt: "2026-04-07T00:00:00.000Z",
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "old-picture",
          documentId: "primary",
          kind: "picture",
          originalName: "old.png",
          mimeType: "image/png",
          byteSize: 123,
          storagePath: "/tmp/job-ops-test/design-resume/assets/old-picture.png",
          createdAt: "2026-04-07T00:00:00.000Z",
          updatedAt: "2026-04-07T00:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([]);

    await importDesignResumeFromReactiveResume();

    expect(repo.deleteDesignResumeAssetsForDocument).toHaveBeenCalledWith(
      "primary",
    );
    expect(fsMocks.unlink).toHaveBeenCalledWith(
      "/tmp/job-ops-test/design-resume/assets/old-picture.png",
    );
  });

  it("rejects importing a v4 Reactive Resume source", async () => {
    vi.mocked(getResume).mockResolvedValueOnce({
      id: "rx-1",
      mode: "v4",
      data: {},
    } as never);

    await expect(importDesignResumeFromReactiveResume()).rejects.toThrow(
      "Design Resume import now requires a Reactive Resume v5 source",
    );
  });
});
