import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("./v4", () => ({
  listResumes: vi.fn(),
  getResume: vi.fn(),
  importResume: vi.fn(),
  deleteResume: vi.fn(),
  exportResumePdf: vi.fn(),
  RxResumeCredentialsError: class RxResumeCredentialsError extends Error {},
}));

vi.mock("./v5", () => ({
  listResumes: vi.fn(),
  getResume: vi.fn(),
  importResume: vi.fn(),
  deleteResume: vi.fn(),
  exportResumePdf: vi.fn(),
  verifyApiKey: vi.fn(),
}));

vi.mock("./client", () => ({
  RxResumeClient: {
    verifyCredentials: vi.fn(),
  },
}));

import { getSetting } from "@server/repositories/settings";
import { RxResumeClient } from "./client";
import {
  listResumes,
  RxResumeAuthConfigError,
  resolveRxResumeMode,
  validateCredentials,
} from "./index";
import * as v4 from "./v4";
import * as v5 from "./v5";

type SettingMap = Partial<Record<string, string | null>>;

function mockSettings(map: SettingMap): void {
  vi.mocked(getSetting).mockImplementation(
    async (key: string) => map[key] ?? null,
  );
}

describe("rxresume adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RXRESUME_API_KEY;
    delete process.env.RXRESUME_EMAIL;
    delete process.env.RXRESUME_PASSWORD;
    delete process.env.RXRESUME_MODE;
    mockSettings({});
  });

  it("prefers v5 in auto mode when both v5 and v4 credentials exist", async () => {
    mockSettings({
      rxresumeMode: "auto",
      rxresumeApiKey: "v5-key",
      rxresumeEmail: "user@example.com",
      rxresumePassword: "pw",
    });

    await expect(resolveRxResumeMode()).resolves.toBe("v5");
  });

  it("falls back to v4 in auto mode when v5 key is missing", async () => {
    mockSettings({
      rxresumeMode: "auto",
      rxresumeEmail: "user@example.com",
      rxresumePassword: "pw",
    });

    await expect(resolveRxResumeMode()).resolves.toBe("v4");
  });

  it("throws targeted error when explicit v5 is selected without api key", async () => {
    mockSettings({ rxresumeMode: "v5" });

    await expect(resolveRxResumeMode()).rejects.toBeInstanceOf(
      RxResumeAuthConfigError,
    );
    await expect(resolveRxResumeMode()).rejects.toThrow(/v5 API key/i);
  });

  it("routes listResumes through v5 and normalizes title when v5 is selected", async () => {
    mockSettings({ rxresumeMode: "v5", rxresumeApiKey: "v5-key" });
    vi.mocked(v5.listResumes).mockResolvedValue([
      {
        id: "r1",
        name: "Resume One",
        slug: "resume-one",
        tags: [],
        isPublic: false,
        isLocked: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "r2",
        name: "Resume Two",
        slug: "resume-two",
        tags: [],
        isPublic: false,
        isLocked: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    const result = await listResumes();

    expect(v5.listResumes).toHaveBeenCalledWith({
      apiKey: "v5-key",
      baseUrl: "https://rxresu.me",
    });
    expect(v4.listResumes).not.toHaveBeenCalled();
    expect(result).toEqual([
      { id: "r1", name: "Resume One", title: "Resume One" },
      { id: "r2", name: "Resume Two", title: "Resume Two" },
    ]);
  });

  it("accepts wrapped v5 list response payloads", async () => {
    mockSettings({ rxresumeMode: "v5", rxresumeApiKey: "v5-key" });
    vi.mocked(v5.listResumes).mockResolvedValue({
      items: [
        {
          id: "r1",
          name: "Resume One",
          slug: "resume-one",
          tags: [],
          isPublic: false,
          isLocked: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    } as unknown as Awaited<ReturnType<typeof v5.listResumes>>);

    const result = await listResumes();

    expect(result).toEqual([
      { id: "r1", name: "Resume One", title: "Resume One" },
    ]);
  });

  it("falls back to v4 at runtime in auto mode when v5 returns unauthorized", async () => {
    mockSettings({
      rxresumeMode: "auto",
      rxresumeApiKey: "stale-v5-key",
      rxresumeEmail: "user@example.com",
      rxresumePassword: "pw",
    });
    vi.mocked(v5.listResumes).mockRejectedValue(
      new Error("Reactive Resume API error (401): Unauthorized"),
    );
    vi.mocked(v4.listResumes).mockResolvedValue([
      { id: "legacy-1", name: "Legacy Resume", title: "Legacy Resume" },
    ]);

    const result = await listResumes();

    expect(v5.listResumes).toHaveBeenCalledTimes(1);
    expect(v4.listResumes).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      { id: "legacy-1", name: "Legacy Resume", title: "Legacy Resume" },
    ]);
  });

  it("validates v4 credentials when auto mode resolves to v4", async () => {
    mockSettings({
      rxresumeMode: "auto",
      rxresumeEmail: "user@example.com",
      rxresumePassword: "pw",
    });
    vi.mocked(RxResumeClient.verifyCredentials).mockResolvedValue({ ok: true });

    const result = await validateCredentials();

    expect(RxResumeClient.verifyCredentials).toHaveBeenCalledWith(
      "user@example.com",
      "pw",
      "https://v4.rxresu.me",
    );
    expect(result).toEqual({ ok: true, mode: "v4" });
  });

  it("falls back to v4 validation in auto mode when v5 key is unauthorized", async () => {
    mockSettings({
      rxresumeMode: "auto",
      rxresumeApiKey: "stale-v5-key",
      rxresumeEmail: "user@example.com",
      rxresumePassword: "pw",
    });
    vi.mocked(v5.verifyApiKey).mockResolvedValue({
      ok: false,
      status: 401,
      message: "Reactive Resume API error (401): Unauthorized",
    });
    vi.mocked(RxResumeClient.verifyCredentials).mockResolvedValue({ ok: true });

    const result = await validateCredentials();

    expect(v5.verifyApiKey).toHaveBeenCalledTimes(1);
    expect(RxResumeClient.verifyCredentials).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, mode: "v4" });
  });
});
