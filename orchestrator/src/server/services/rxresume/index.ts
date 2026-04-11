import { createHash } from "node:crypto";
import { getSetting } from "@server/repositories/settings";
import { pickProjectIdsForJob } from "@server/services/projectSelection";
import { resolveResumeProjectsSettings } from "@server/services/resumeProjects";
import {
  resolveTracerPublicBaseUrl,
  rewriteResumeLinksWithTracer,
} from "@server/services/tracer-links";
import type { ResumeProjectCatalogItem } from "@shared/types";
import {
  getResumeSchemaValidationMessage,
  safeParseV5ResumeData,
} from "./schema";
import {
  applyProjectVisibility,
  applyTailoredChunks,
  cloneResumeData,
  extractProjectsFromResume as extractProjectsFromResumeV5,
  type TailoredSkillsInput,
} from "./tailoring";
import * as v5 from "./v5";

export type RxResumeResume = {
  id: string;
  name: string;
  title?: string;
  slug?: string;
  mode?: "v5";
  data?: unknown;
  [key: string]: unknown;
};

export type RxResumeImportPayload = {
  name?: string;
  slug?: string;
  data: unknown;
};

export type PreparedRxResumePdfPayload = {
  mode: "v5";
  data: Record<string, unknown>;
  projectCatalog: ResumeProjectCatalogItem[];
  selectedProjectIds: string[];
};

export class RxResumeAuthConfigError extends Error {
  constructor(message: string) {
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
  forceRefresh?: boolean;
  v5?: { apiKey?: string | null; baseUrl?: string | null };
};

type V5Credentials = Awaited<ReturnType<typeof readV5Credentials>>;

const RXRESUME_RESUME_CACHE_TTL_MS = 5 * 60 * 1000;

type RxResumeResumeCacheEntry = {
  expiresAt: number;
  resume: RxResumeResume;
};

const rxResumeResumeCache = new Map<string, RxResumeResumeCacheEntry>();
const inFlightResumeRequests = new Map<string, Promise<RxResumeResume>>();
let rxResumeResumeCacheGeneration = 0;

function hasOverrideKey<T extends object>(
  value: T | undefined,
  key: PropertyKey,
): boolean {
  return value !== undefined && Object.hasOwn(value, key);
}

function resolveOverrideValue(args: {
  overrideValue?: string | null;
  hasOverride: boolean;
  storedValue?: string | null;
  envValue?: string | null;
  fallback?: string;
}): string {
  if (args.hasOverride) {
    const trimmed = args.overrideValue?.trim() ?? "";
    return trimmed || args.envValue?.trim() || args.fallback || "";
  }

  return (
    args.storedValue?.trim() || args.envValue?.trim() || args.fallback || ""
  );
}

function cloneResume(resume: RxResumeResume): RxResumeResume {
  return structuredClone(resume) as RxResumeResume;
}

function normalizeBaseUrlForCache(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

function buildCredentialFingerprint(creds: V5Credentials): string {
  return createHash("sha256")
    .update(creds.apiKey.trim())
    .digest("hex")
    .slice(0, 12);
}

function buildResumeCacheKey(resumeId: string, creds: V5Credentials): string {
  return [
    "v5",
    normalizeBaseUrlForCache(creds.baseUrl),
    resumeId.trim(),
    buildCredentialFingerprint(creds),
  ].join("::");
}

export function clearRxResumeResumeCache(): void {
  rxResumeResumeCacheGeneration += 1;
  rxResumeResumeCache.clear();
  inFlightResumeRequests.clear();
}

function normalizeError(error: unknown): Error {
  if (
    error instanceof RxResumeAuthConfigError ||
    error instanceof RxResumeRequestError
  ) {
    return error;
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

async function readV5Credentials(overrides?: ResolveModeOptions["v5"]) {
  const [storedApiKey, storedBaseUrl] = await Promise.all([
    getSetting("rxresumeApiKey"),
    getSetting("rxresumeUrl"),
  ]);
  const apiKey = resolveOverrideValue({
    overrideValue: overrides?.apiKey,
    hasOverride: hasOverrideKey(overrides, "apiKey"),
    storedValue: storedApiKey,
    envValue: process.env.RXRESUME_API_KEY,
  });
  const baseUrl = resolveOverrideValue({
    overrideValue: overrides?.baseUrl,
    hasOverride: hasOverrideKey(overrides, "baseUrl"),
    storedValue: storedBaseUrl,
    envValue: process.env.RXRESUME_URL,
    fallback: "https://rxresu.me",
  });

  if (!apiKey) {
    throw new RxResumeAuthConfigError(
      "Reactive Resume API key is not configured. Set RXRESUME_API_KEY or configure rxresumeApiKey in Settings.",
    );
  }

  return { apiKey, baseUrl, available: Boolean(apiKey) };
}

async function fetchResumeFromUpstream(
  resumeId: string,
  creds: V5Credentials,
): Promise<RxResumeResume> {
  try {
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
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function listResumes(
  options: ResolveModeOptions = {},
): Promise<RxResumeResume[]> {
  try {
    const creds = await readV5Credentials(options.v5);
    return normalizeV5ResumeListResponse(
      await v5.listResumes({ apiKey: creds.apiKey, baseUrl: creds.baseUrl }),
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function getResume(
  resumeId: string,
  options: ResolveModeOptions = {},
): Promise<RxResumeResume> {
  const creds = await readV5Credentials(options.v5);
  const cacheKey = buildResumeCacheKey(resumeId, creds);
  const now = Date.now();

  if (!options.forceRefresh) {
    const cached = rxResumeResumeCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cloneResume(cached.resume);
    }
    if (cached) {
      rxResumeResumeCache.delete(cacheKey);
    }

    const inFlight = inFlightResumeRequests.get(cacheKey);
    if (inFlight) {
      return cloneResume(await inFlight);
    }
  }

  const generation = rxResumeResumeCacheGeneration;
  let request: Promise<RxResumeResume>;
  request = fetchResumeFromUpstream(resumeId, creds)
    .then((resume) => {
      const cachedResume = cloneResume(resume);
      if (generation === rxResumeResumeCacheGeneration) {
        rxResumeResumeCache.set(cacheKey, {
          expiresAt: Date.now() + RXRESUME_RESUME_CACHE_TTL_MS,
          resume: cachedResume,
        });
      }
      return cloneResume(cachedResume);
    })
    .finally(() => {
      if (inFlightResumeRequests.get(cacheKey) === request) {
        inFlightResumeRequests.delete(cacheKey);
      }
    });

  inFlightResumeRequests.set(cacheKey, request);
  return request;
}

export async function validateResumeSchema(
  resumeData: unknown,
): Promise<
  | { ok: true; mode: "v5"; data: Record<string, unknown> }
  | { ok: false; mode: "v5"; message: string }
> {
  const result = safeParseV5ResumeData(resumeData);
  if (!result.success) {
    return {
      ok: false,
      mode: "v5",
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
      mode: "v5",
      message:
        "Resume schema validation failed: root payload must be an object.",
    };
  }

  return {
    ok: true,
    mode: "v5",
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

export function extractProjectsFromResume(resumeData: unknown): {
  mode: "v5";
  catalog: ResumeProjectCatalogItem[];
} {
  const parsed = safeParseV5ResumeData(resumeData);
  if (!parsed.success) {
    throw new Error(getResumeSchemaValidationMessage(parsed.error));
  }
  const { catalog } = extractProjectsFromResumeV5(
    parsed.data as Record<string, unknown>,
  );
  return { mode: "v5", catalog };
}

export async function prepareTailoredResumeForPdf(args: {
  resumeData: unknown;
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
  const parsed = safeParseV5ResumeData(args.resumeData);
  if (!parsed.success) {
    throw new Error(getResumeSchemaValidationMessage(parsed.error));
  }

  const workingCopy = cloneResumeData(parsed.data as Record<string, unknown>);
  applyTailoredChunks({
    resumeData: workingCopy,
    tailoredContent: args.tailoredContent,
  });

  const { catalog, selectionItems } = extractProjectsFromResumeV5(workingCopy);

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
    mode: "v5",
    data: workingCopy,
    projectCatalog: catalog,
    selectedProjectIds: selectedIds,
  };
}

export async function importResume(
  payload: RxResumeImportPayload,
  options: ResolveModeOptions = {},
): Promise<string> {
  try {
    const creds = await readV5Credentials(options.v5);
    return await v5.importResume(
      {
        name: payload.name?.trim() || "JobOps Tailored Resume",
        slug: payload.slug?.trim() || "",
        data: payload.data,
      },
      {
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
      },
    );
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function deleteResume(
  resumeId: string,
  options: ResolveModeOptions = {},
): Promise<void> {
  try {
    const creds = await readV5Credentials(options.v5);
    await v5.deleteResume(resumeId, {
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl,
    });
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function exportResumePdf(
  resumeId: string,
  options: ResolveModeOptions = {},
): Promise<string> {
  try {
    const creds = await readV5Credentials(options.v5);
    return await v5.exportResumePdf(resumeId, {
      apiKey: creds.apiKey,
      baseUrl: creds.baseUrl,
    });
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function validateCredentials(
  options: ResolveModeOptions = {},
): Promise<
  | { ok: true; mode: "v5" }
  | { ok: false; mode: "v5"; status: number; message: string }
> {
  try {
    const v5Creds = await readV5Credentials(options.v5);
    const result = await v5.verifyApiKey(v5Creds.apiKey, v5Creds.baseUrl);
    if (result.ok) return { ok: true as const, mode: "v5" as const };
    return {
      ok: false as const,
      mode: "v5",
      status: result.status,
      message: result.message || "Reactive Resume validation failed.",
    };
  } catch (error) {
    const normalized = normalizeError(error);
    if (normalized instanceof RxResumeAuthConfigError) {
      return {
        ok: false,
        mode: "v5",
        status: 400,
        message: normalized.message,
      };
    }
    const status =
      normalized instanceof RxResumeRequestError ? (normalized.status ?? 0) : 0;
    return {
      ok: false,
      mode: "v5",
      status,
      message: normalized.message,
    };
  }
}
