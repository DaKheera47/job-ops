import { getSetting } from "@server/repositories/settings";
import { pickProjectIdsForJob } from "@server/services/projectSelection";
import { resolveResumeProjectsSettings } from "@server/services/resumeProjects";
import {
  resolveTracerPublicBaseUrl,
  rewriteResumeLinksWithTracer,
} from "@server/services/tracer-links";
import { settingsRegistry } from "@shared/settings-registry";
import type { ResumeProjectCatalogItem, RxResumeMode } from "@shared/types";
import { RxResumeClient } from "./client";
import {
  getResumeSchemaValidationMessage,
  safeParseResumeDataForMode,
} from "./schema";
import {
  applyProjectVisibility,
  applyTailoredChunks,
  cloneResumeData,
  extractProjectsFromResume as extractProjectsFromResumeByMode,
  inferRxResumeModeFromData,
  type TailoredSkillsInput,
  validateAndParseResumeDataForMode,
} from "./tailoring";
import * as v4 from "./v4";
import * as v5 from "./v5";

export type RxResumeResolvedMode = "v4" | "v5";

export type RxResumeResume = {
  id: string;
  name: string;
  title?: string;
  slug?: string;
  mode?: RxResumeResolvedMode;
  data?: unknown;
  [key: string]: unknown;
};

export type RxResumeImportPayload = {
  name?: string;
  slug?: string;
  data: unknown;
};

export type PreparedRxResumePdfPayload = {
  mode: RxResumeResolvedMode;
  data: Record<string, unknown>;
  projectCatalog: ResumeProjectCatalogItem[];
  selectedProjectIds: string[];
};

export class RxResumeAuthConfigError extends Error {
  constructor(
    public readonly mode: RxResumeMode | RxResumeResolvedMode,
    message: string,
  ) {
    super(message);
    this.name = "RxResumeAuthConfigError";
  }
}

export class RxResumeRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
  ) {
    super(message);
    this.name = "RxResumeRequestError";
  }
}

type ResolveModeOptions = {
  mode?: RxResumeMode;
  v4?: {
    email?: string | null;
    password?: string | null;
    baseUrl?: string | null;
  };
  v5?: { apiKey?: string | null; baseUrl?: string | null };
};

type V4Credentials = Awaited<ReturnType<typeof readV4Credentials>>;
type V5Credentials = Awaited<ReturnType<typeof readV5Credentials>>;

function toV4Override(
  input?: ResolveModeOptions["v4"],
): Partial<v4.RxResumeCredentials> | undefined {
  if (!input) return undefined;
  return {
    ...(typeof input.email === "string" ? { email: input.email } : {}),
    ...(typeof input.password === "string" ? { password: input.password } : {}),
    ...(typeof input.baseUrl === "string" ? { baseUrl: input.baseUrl } : {}),
  };
}

function normalizeMode(raw: string | null | undefined): RxResumeMode {
  const parsed = settingsRegistry.rxresumeMode.parse(raw ?? undefined);
  return parsed ?? "v5";
}

function normalizeError(error: unknown): Error {
  if (
    error instanceof RxResumeAuthConfigError ||
    error instanceof RxResumeRequestError
  ) {
    return error;
  }
  if (error instanceof v4.RxResumeCredentialsError) {
    return new RxResumeAuthConfigError(
      "v4",
      "Reactive Resume v4 credentials are not configured.",
    );
  }
  if (error instanceof Error) {
    const match = /Reactive Resume API error \((\d+)\)/i.exec(error.message);
    const isNetworkLikeFailure =
      error.name === "AbortError" ||
      (error instanceof TypeError &&
        /fetch failed|network/i.test(error.message || ""));
    return new RxResumeRequestError(
      error.message,
      match ? Number(match[1]) : isNetworkLikeFailure ? 0 : null,
    );
  }
  return new RxResumeRequestError("Reactive Resume request failed.");
}

function normalizeV5ResumeListResponse(payload: unknown): RxResumeResume[] {
  if (!Array.isArray(payload)) {
    throw new RxResumeRequestError(
      "Reactive Resume v5 returned an unexpected resume list response shape.",
    );
  }

  return payload.map((resume) => {
    if (!resume || typeof resume !== "object") {
      throw new RxResumeRequestError(
        "Reactive Resume v5 returned an invalid resume list item.",
      );
    }
    const item = resume as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id : String(item.id ?? "");
    const name =
      typeof item.name === "string" && item.name.trim()
        ? item.name
        : typeof item.title === "string" && item.title.trim()
          ? item.title
          : id;

    return {
      ...item,
      id,
      name,
      title: name,
    } as RxResumeResume;
  });
}

function normalizeV5ResumeResponse(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new RxResumeRequestError(
      "Reactive Resume v5 returned an unexpected resume response shape.",
    );
  }

  return payload as Record<string, unknown>;
}

async function readConfiguredMode(): Promise<RxResumeMode> {
  const [storedMode] = await Promise.all([getSetting("rxresumeMode")]);
  return normalizeMode(storedMode ?? process.env.RXRESUME_MODE ?? null);
}

async function readV4Credentials(overrides?: ResolveModeOptions["v4"]) {
  const [storedEmail, storedPassword] = await Promise.all([
    getSetting("rxresumeEmail"),
    getSetting("rxresumePassword"),
  ]);
  const email =
    overrides?.email?.trim() ||
    process.env.RXRESUME_EMAIL?.trim() ||
    storedEmail?.trim() ||
    "";
  const password =
    overrides?.password?.trim() ||
    process.env.RXRESUME_PASSWORD?.trim() ||
    storedPassword?.trim() ||
    "";
  const baseUrl =
    overrides?.baseUrl?.trim() ||
    process.env.RXRESUME_URL?.trim() ||
    "https://v4.rxresu.me";
  return { email, password, baseUrl, available: Boolean(email && password) };
}

async function readV5Credentials(overrides?: ResolveModeOptions["v5"]) {
  const [storedApiKey] = await Promise.all([getSetting("rxresumeApiKey")]);
  const apiKey =
    overrides?.apiKey?.trim() ||
    process.env.RXRESUME_API_KEY?.trim() ||
    storedApiKey?.trim() ||
    "";
  const baseUrl =
    overrides?.baseUrl?.trim() ||
    process.env.RXRESUME_URL?.trim() ||
    "https://rxresu.me";
  return { apiKey, baseUrl, available: Boolean(apiKey) };
}

export async function resolveRxResumeMode(
  options: ResolveModeOptions = {},
): Promise<RxResumeResolvedMode> {
  const mode = options.mode ?? (await readConfiguredMode());
  const [v5Creds, v4Creds] = await Promise.all([
    readV5Credentials(options.v5),
    readV4Credentials(options.v4),
  ]);

  if (mode === "v5") {
    if (!v5Creds.available) {
      throw new RxResumeAuthConfigError(
        "v5",
        "Reactive Resume v5 API key is not configured. Set RXRESUME_API_KEY or configure rxresumeApiKey in Settings.",
      );
    }
    return "v5";
  }

  if (mode === "v4") {
    if (!v4Creds.available) {
      throw new RxResumeAuthConfigError(
        "v4",
        "Reactive Resume v4 credentials are not configured. Set RXRESUME_EMAIL and RXRESUME_PASSWORD or configure them in Settings.",
      );
    }
    return "v4";
  }
  throw new RxResumeAuthConfigError(
    mode,
    "Reactive Resume mode must be set to v4 or v5.",
  );
}

async function runRxResumeOperation<T>(
  options: ResolveModeOptions,
  handlers: {
    v4: (creds: V4Credentials) => Promise<T>;
    v5: (creds: V5Credentials) => Promise<T>;
  },
): Promise<T> {
  const requestedMode = options.mode ?? (await readConfiguredMode());
  const [v5Creds, v4Creds] = await Promise.all([
    readV5Credentials(options.v5),
    readV4Credentials(options.v4),
  ]);

  if (requestedMode === "v5") {
    if (!v5Creds.available) {
      throw new RxResumeAuthConfigError(
        "v5",
        "Reactive Resume v5 API key is not configured. Set RXRESUME_API_KEY or configure rxresumeApiKey in Settings.",
      );
    }
    try {
      return await handlers.v5(v5Creds);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  if (!v4Creds.available) {
    throw new RxResumeAuthConfigError(
      "v4",
      "Reactive Resume v4 credentials are not configured. Set RXRESUME_EMAIL and RXRESUME_PASSWORD or configure them in Settings.",
    );
  }
  try {
    return await handlers.v4(v4Creds);
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function listResumes(
  options: ResolveModeOptions = {},
): Promise<RxResumeResume[]> {
  return runRxResumeOperation(options, {
    v5: async (creds) =>
      normalizeV5ResumeListResponse(
        await v5.listResumes({ apiKey: creds.apiKey, baseUrl: creds.baseUrl }),
      ),
    v4: async (creds) =>
      (await v4.listResumes(toV4Override(creds))) as RxResumeResume[],
  });
}

export async function getResume(
  resumeId: string,
  options: ResolveModeOptions = {},
): Promise<RxResumeResume> {
  return runRxResumeOperation(options, {
    v5: async (creds) => {
      const resume = normalizeV5ResumeResponse(
        await v5.getResume(resumeId, {
          apiKey: creds.apiKey,
          baseUrl: creds.baseUrl,
        }),
      ) as RxResumeResume;
      return {
        ...resume,
        mode: "v5",
        title:
          typeof resume.name === "string" && resume.name.trim()
            ? resume.name
            : (resume.slug ?? resume.id),
        data: resume.data,
      } as RxResumeResume;
    },
    v4: async (creds) => ({
      ...((await v4.getResume(
        resumeId,
        toV4Override(creds),
      )) as RxResumeResume),
      mode: "v4",
    }),
  });
}

export async function validateResumeSchema(
  resumeData: unknown,
  options: ResolveModeOptions = {},
): Promise<
  | { ok: true; mode: RxResumeResolvedMode; data: Record<string, unknown> }
  | { ok: false; mode: RxResumeResolvedMode; message: string }
> {
  const mode = await resolveRxResumeMode(options);
  const result = safeParseResumeDataForMode(mode, resumeData);
  if (!result.success) {
    return {
      ok: false,
      mode,
      message: getResumeSchemaValidationMessage(result.error),
    };
  }

  if (
    !result.data ||
    typeof result.data !== "object" ||
    Array.isArray(result.data)
  ) {
    return {
      ok: false,
      mode,
      message:
        "Resume schema validation failed: root payload must be an object.",
    };
  }

  return {
    ok: true,
    mode,
    data: result.data as Record<string, unknown>,
  };
}

function parseSelectedProjectIds(selectedProjectIds?: string | null): string[] {
  if (selectedProjectIds === null || selectedProjectIds === undefined)
    return [];
  return selectedProjectIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractProjectsFromResume(
  resumeData: unknown,
  options: { mode?: RxResumeMode } = {},
): { mode: RxResumeResolvedMode; catalog: ResumeProjectCatalogItem[] } {
  const mode = (options.mode ??
    inferRxResumeModeFromData(resumeData) ??
    "v5") as RxResumeResolvedMode;
  const parsed = validateAndParseResumeDataForMode(mode, resumeData);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }
  const { catalog } = extractProjectsFromResumeByMode(mode, parsed.data);
  return { mode, catalog };
}

export async function prepareTailoredResumeForPdf(args: {
  resumeData: unknown;
  mode?: RxResumeMode;
  tailoredContent: {
    summary?: string | null;
    headline?: string | null;
    skills?: TailoredSkillsInput;
  };
  jobDescription: string;
  selectedProjectIds?: string | null;
  tracerLinks?: {
    enabled: boolean;
    requestOrigin?: string | null;
    companyName?: string | null;
  };
  forceVisibleProjectsSection?: boolean;
  jobId?: string;
}): Promise<PreparedRxResumePdfPayload> {
  const mode = (args.mode ??
    (await readConfiguredMode())) as RxResumeResolvedMode;
  const parsed = validateAndParseResumeDataForMode(mode, args.resumeData);
  if (!parsed.ok) {
    throw new Error(parsed.message);
  }

  const workingCopy = cloneResumeData(parsed.data);
  applyTailoredChunks({
    mode,
    resumeData: workingCopy,
    tailoredContent: args.tailoredContent,
  });

  const { catalog, selectionItems } = extractProjectsFromResumeByMode(
    mode,
    workingCopy,
  );

  let selectedIds = parseSelectedProjectIds(args.selectedProjectIds);

  if (
    args.selectedProjectIds === null ||
    args.selectedProjectIds === undefined
  ) {
    const overrideResumeProjectsRaw = await getSetting("resumeProjects");
    const { resumeProjects } = resolveResumeProjectsSettings({
      catalog,
      overrideRaw: overrideResumeProjectsRaw,
    });

    const locked = resumeProjects.lockedProjectIds;
    const desiredCount = Math.max(
      0,
      resumeProjects.maxProjects - locked.length,
    );
    const eligibleSet = new Set(resumeProjects.aiSelectableProjectIds);
    const eligibleProjects = selectionItems.filter((p) =>
      eligibleSet.has(p.id),
    );
    const picked = await pickProjectIdsForJob({
      jobDescription: args.jobDescription,
      eligibleProjects,
      desiredCount,
    });
    selectedIds = [...locked, ...picked];
  }

  applyProjectVisibility({
    mode,
    resumeData: workingCopy,
    selectedProjectIds: new Set(selectedIds),
    forceVisibleProjectsSection: args.forceVisibleProjectsSection,
  });

  if (args.tracerLinks?.enabled) {
    const tracerBaseUrl = resolveTracerPublicBaseUrl({
      requestOrigin: args.tracerLinks.requestOrigin,
    });
    if (!tracerBaseUrl) {
      throw new Error(
        "Tracer links are enabled but no public base URL is available. Set JOBOPS_PUBLIC_BASE_URL.",
      );
    }
    if (!args.jobId) {
      throw new Error(
        "Tracer links are enabled but jobId was not provided for resume tailoring.",
      );
    }

    await rewriteResumeLinksWithTracer({
      jobId: args.jobId,
      resumeData: workingCopy,
      publicBaseUrl: tracerBaseUrl,
      companyName: args.tracerLinks.companyName ?? null,
    });
  }

  return {
    mode,
    data: workingCopy,
    projectCatalog: catalog,
    selectedProjectIds: selectedIds,
  };
}

export async function importResume(
  payload: RxResumeImportPayload,
  options: ResolveModeOptions = {},
): Promise<string> {
  return runRxResumeOperation(options, {
    v5: async (creds) =>
      await v5.importResume(
        {
          name: payload.name?.trim() || "JobOps Tailored Resume",
          slug: payload.slug?.trim() || "",
          data: payload.data,
        },
        {
          apiKey: creds.apiKey,
          baseUrl: creds.baseUrl,
        },
      ),
    v4: async (creds) =>
      await v4.importResume(
        payload as v4.RxResumeImportPayload,
        toV4Override(creds),
      ),
  });
}

export async function deleteResume(
  resumeId: string,
  options: ResolveModeOptions = {},
): Promise<void> {
  await runRxResumeOperation(options, {
    v5: async (creds) => {
      await v5.deleteResume(resumeId, {
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
      });
    },
    v4: async (creds) => await v4.deleteResume(resumeId, toV4Override(creds)),
  });
}

export async function exportResumePdf(
  resumeId: string,
  options: ResolveModeOptions = {},
): Promise<string> {
  return runRxResumeOperation(options, {
    v5: async (creds) =>
      await v5.exportResumePdf(resumeId, {
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
      }),
    v4: async (creds) =>
      await v4.exportResumePdf(resumeId, toV4Override(creds)),
  });
}

export async function validateCredentials(
  options: ResolveModeOptions = {},
): Promise<
  | { ok: true; mode: RxResumeResolvedMode }
  | { ok: false; mode?: RxResumeMode; status: number; message: string }
> {
  const requestedMode = options.mode ?? (await readConfiguredMode());
  const [v5Creds, v4Creds] = await Promise.all([
    readV5Credentials(options.v5),
    readV4Credentials(options.v4),
  ]);

  const validateV4 = async () => {
    const result = await RxResumeClient.verifyCredentials(
      v4Creds.email,
      v4Creds.password,
      v4Creds.baseUrl,
    );
    if (result.ok) return { ok: true as const, mode: "v4" as const };
    return {
      ok: false as const,
      mode: requestedMode,
      status: result.status,
      message: result.message || "Reactive Resume v4 validation failed.",
    };
  };

  const validateV5 = async () => {
    const result = await v5.verifyApiKey(v5Creds.apiKey, v5Creds.baseUrl);
    if (result.ok) return { ok: true as const, mode: "v5" as const };
    return {
      ok: false as const,
      mode: requestedMode,
      status: result.status,
      message: result.message || "Reactive Resume v5 validation failed.",
    };
  };

  try {
    const mode = await resolveRxResumeMode(options);
    if (mode === "v5") {
      return await validateV5();
    }
    return await validateV4();
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized instanceof RxResumeAuthConfigError) {
      return {
        ok: false,
        mode: requestedMode,
        status: 400,
        message: normalized.message,
      };
    }
    const status =
      normalized instanceof RxResumeRequestError ? (normalized.status ?? 0) : 0;
    return {
      ok: false,
      mode: requestedMode,
      status,
      message: normalized.message,
    };
  }
}
