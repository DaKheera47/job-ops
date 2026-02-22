import { getSetting } from "@server/repositories/settings";
import type { ResumeData } from "@shared/rxresume-schema";
import { settingsRegistry } from "@shared/settings-registry";
import type { RxResumeMode } from "@shared/types";
import { RxResumeClient } from "./client";
import * as v4 from "./v4";
import * as v5 from "./v5";

export type RxResumeResolvedMode = "v4" | "v5";

export type RxResumeResume = {
  id: string;
  name: string;
  title?: string;
  slug?: string;
  data?: ResumeData;
  [key: string]: unknown;
};

export type RxResumeImportPayload = {
  name?: string;
  slug?: string;
  data: ResumeData;
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
  return parsed ?? "auto";
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
    return new RxResumeRequestError(
      error.message,
      match ? Number(match[1]) : null,
    );
  }
  return new RxResumeRequestError("Reactive Resume request failed.");
}

function isRetryableV5AutoFallbackError(error: Error): boolean {
  if (error instanceof RxResumeAuthConfigError) return error.mode === "v5";
  if (error instanceof RxResumeRequestError) {
    return (
      error.status === 0 ||
      error.status === 401 ||
      error.status === 403 ||
      (typeof error.status === "number" && error.status >= 500)
    );
  }
  return false;
}

function normalizeV5ResumeListResponse(payload: unknown): RxResumeResume[] {
  let candidates: unknown[] | null = null;
  if (Array.isArray(payload)) {
    candidates = payload;
  } else if (payload && typeof payload === "object") {
    const record = payload as { items?: unknown; data?: unknown };
    if (Array.isArray(record.items)) {
      candidates = record.items;
    } else if (Array.isArray(record.data)) {
      candidates = record.data;
    }
  }

  if (!candidates) {
    throw new RxResumeRequestError(
      "Reactive Resume v5 returned an unexpected resume list response shape.",
    );
  }

  return candidates.map((resume) => {
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

  if (v5Creds.available) return "v5";
  if (v4Creds.available) return "v4";

  throw new RxResumeAuthConfigError(
    "auto",
    "Reactive Resume is not configured. Add a v5 API key or v4 email/password credentials.",
  );
}

async function runRxResumeOperationWithAutoFallback<T>(
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

  if (requestedMode === "v4") {
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

  if (v5Creds.available) {
    try {
      return await handlers.v5(v5Creds);
    } catch (error) {
      const normalized = normalizeError(error);
      if (v4Creds.available && isRetryableV5AutoFallbackError(normalized)) {
        try {
          return await handlers.v4(v4Creds);
        } catch (fallbackError) {
          throw normalizeError(fallbackError);
        }
      }
      throw normalized;
    }
  }

  if (v4Creds.available) {
    try {
      return await handlers.v4(v4Creds);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  throw new RxResumeAuthConfigError(
    "auto",
    "Reactive Resume is not configured. Add a v5 API key or v4 email/password credentials.",
  );
}

export async function listResumes(
  options: ResolveModeOptions = {},
): Promise<RxResumeResume[]> {
  return runRxResumeOperationWithAutoFallback(options, {
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
  return runRxResumeOperationWithAutoFallback(options, {
    v5: async (creds) => {
      const resume = await v5.getResume(resumeId, {
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
      });
      return {
        ...resume,
        title:
          typeof resume.name === "string" && resume.name.trim()
            ? resume.name
            : (resume.slug ?? resume.id),
        data:
          resume.data && typeof resume.data === "object"
            ? (resume.data as ResumeData)
            : undefined,
      };
    },
    v4: async (creds) =>
      (await v4.getResume(resumeId, toV4Override(creds))) as RxResumeResume,
  });
}

export async function importResume(
  payload: RxResumeImportPayload,
  options: ResolveModeOptions = {},
): Promise<string> {
  return runRxResumeOperationWithAutoFallback(options, {
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
    v4: async (creds) => await v4.importResume(payload, toV4Override(creds)),
  });
}

export async function deleteResume(
  resumeId: string,
  options: ResolveModeOptions = {},
): Promise<void> {
  await runRxResumeOperationWithAutoFallback(options, {
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
  return runRxResumeOperationWithAutoFallback(options, {
    v5: async (creds) =>
      await v5.exportResumePdf(resumeId, {
        apiKey: creds.apiKey,
        baseUrl: creds.baseUrl,
      }),
    v4: async (creds) => await v4.exportResumePdf(resumeId, toV4Override(creds)),
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
    if (requestedMode === "auto") {
      if (v5Creds.available) {
        const v5Result = await validateV5();
        if (v5Result.ok) return v5Result;

        const normalized = new RxResumeRequestError(
          v5Result.message,
          v5Result.status,
        );
        if (v4Creds.available && isRetryableV5AutoFallbackError(normalized)) {
          return await validateV4();
        }
        return v5Result;
      }
      if (v4Creds.available) {
        return await validateV4();
      }
      throw new RxResumeAuthConfigError(
        "auto",
        "Reactive Resume is not configured. Add a v5 API key or v4 email/password credentials.",
      );
    }

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
