import type { UpdateSettingsInput } from "@shared/settings-schema";
import type {
  AppSettings,
  DesignResumeDocument,
  DesignResumeExportResponse,
  DesignResumeJson,
  DesignResumePatchRequest,
  DesignResumePdfResponse,
  DesignResumeStatusResponse,
  ProfileStatusResponse,
  ResumeProfile,
  ResumeProjectCatalogItem,
  SearchTermsSuggestionResponse,
  ValidationResult,
} from "@shared/types";
import type { CodexAuthStatusResponse } from "./auth";
import { fetchApi, fetchBlobApi, normalizeApiPath } from "./core";

let settingsPromise: Promise<AppSettings> | null = null;

export async function getSettings(): Promise<AppSettings> {
  if (settingsPromise) return settingsPromise;

  settingsPromise = fetchApi<AppSettings>("/settings").finally(() => {
    setTimeout(() => {
      settingsPromise = null;
    }, 100);
  });

  return settingsPromise;
}

export async function getProfileProjects(): Promise<
  ResumeProjectCatalogItem[]
> {
  return fetchApi<ResumeProjectCatalogItem[]>("/profile/projects");
}

export async function getResumeProjectsCatalog(): Promise<
  ResumeProjectCatalogItem[]
> {
  return getProfileProjects();
}

export async function getProfile(): Promise<ResumeProfile> {
  return fetchApi<ResumeProfile>("/profile");
}

export async function getDesignResume(): Promise<DesignResumeDocument> {
  return fetchApi<DesignResumeDocument>("/design-resume");
}

export async function getDesignResumeStatus(): Promise<DesignResumeStatusResponse> {
  return fetchApi<DesignResumeStatusResponse>("/design-resume/status");
}

export async function importDesignResumeFromRxResume(): Promise<DesignResumeDocument> {
  return fetchApi<DesignResumeDocument>("/design-resume/import/rxresume", {
    method: "POST",
  });
}

export async function importDesignResumeFromFile(input: {
  fileName: string;
  mediaType?: string;
  dataBase64: string;
}): Promise<DesignResumeDocument> {
  return fetchApi<DesignResumeDocument>("/design-resume/import/file", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateDesignResume(
  input: DesignResumePatchRequest,
): Promise<DesignResumeDocument> {
  return fetchApi<DesignResumeDocument>("/design-resume", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function uploadDesignResumePicture(input: {
  fileName: string;
  dataUrl: string;
  baseRevision?: number;
  document?: DesignResumeJson;
}): Promise<DesignResumeDocument> {
  return fetchApi<DesignResumeDocument>("/design-resume/assets", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function uploadDesignResumePictureFile(input: {
  file: File;
  baseRevision?: number;
}): Promise<DesignResumeDocument> {
  return fetchApi<DesignResumeDocument>("/design-resume/assets", {
    method: "POST",
    headers: {
      "Content-Type": input.file.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(input.file.name || "picture"),
      ...(input.baseRevision
        ? { "x-base-revision": String(input.baseRevision) }
        : {}),
    },
    body: await input.file.arrayBuffer(),
  });
}

export async function deleteDesignResumePicture(input?: {
  baseRevision?: number;
  document?: DesignResumeJson;
}): Promise<DesignResumeDocument> {
  return fetchApi<DesignResumeDocument>("/design-resume/assets/picture", {
    method: "DELETE",
    body: JSON.stringify(input ?? {}),
  });
}

export async function exportDesignResume(): Promise<DesignResumeExportResponse> {
  return fetchApi<DesignResumeExportResponse>("/design-resume/export");
}

export async function generateDesignResumePdf(): Promise<DesignResumePdfResponse> {
  return fetchApi<DesignResumePdfResponse>("/design-resume/generate-pdf", {
    method: "POST",
  });
}

export async function getDesignResumePdfBlob(pdfUrl?: string): Promise<Blob> {
  return fetchBlobApi(
    pdfUrl ? normalizeApiPath(pdfUrl) : "/design-resume/pdf",
    { cache: "no-store" },
  );
}

export async function getProfileStatus(): Promise<ProfileStatusResponse> {
  return fetchApi<ProfileStatusResponse>("/profile/status");
}

export async function refreshProfile(): Promise<ResumeProfile> {
  return fetchApi<ResumeProfile>("/profile/refresh", {
    method: "POST",
  });
}

export async function validateLlm(input: {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
}): Promise<ValidationResult> {
  return fetchApi<ValidationResult>("/onboarding/validate/llm", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getLlmModels(input?: {
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
}): Promise<string[]> {
  const data = await fetchApi<{ models: string[] }>("/settings/llm-models", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
  return data.models;
}

export async function getCodexAuthStatus(): Promise<CodexAuthStatusResponse> {
  return fetchApi<CodexAuthStatusResponse>("/settings/codex-auth");
}

export async function startCodexAuth(input?: {
  forceRestart?: boolean;
}): Promise<CodexAuthStatusResponse> {
  return fetchApi<CodexAuthStatusResponse>("/settings/codex-auth/start", {
    method: "POST",
    body: JSON.stringify({
      forceRestart: input?.forceRestart ?? false,
    }),
  });
}

export async function disconnectCodexAuth(): Promise<CodexAuthStatusResponse> {
  return fetchApi<CodexAuthStatusResponse>("/settings/codex-auth/disconnect", {
    method: "POST",
  });
}

export async function validateRxresume(input?: {
  apiKey?: string;
  baseUrl?: string;
}): Promise<ValidationResult> {
  return fetchApi<ValidationResult>("/onboarding/validate/rxresume", {
    method: "POST",
    body: JSON.stringify(input ?? {}),
  });
}

export async function validateResumeConfig(): Promise<ValidationResult> {
  return fetchApi<ValidationResult>("/onboarding/validate/resume");
}

export async function suggestOnboardingSearchTerms(): Promise<SearchTermsSuggestionResponse> {
  return fetchApi<SearchTermsSuggestionResponse>(
    "/onboarding/search-terms/suggest",
    {
      method: "POST",
    },
  );
}

export async function updateSettings(
  update: Partial<UpdateSettingsInput>,
): Promise<AppSettings> {
  return fetchApi<AppSettings>("/settings", {
    method: "PATCH",
    body: JSON.stringify(update),
  });
}

export async function getRxResumes(): Promise<{ id: string; name: string }[]> {
  const data = await fetchApi<{ resumes: { id: string; name: string }[] }>(
    `/settings/rx-resumes`,
  );
  return data.resumes;
}

export async function getRxResumeProjects(
  resumeId: string,
  signal?: AbortSignal,
): Promise<ResumeProjectCatalogItem[]> {
  const data = await fetchApi<{ projects: ResumeProjectCatalogItem[] }>(
    `/settings/rx-resumes/${encodeURIComponent(resumeId)}/projects`,
    { signal },
  );
  return data.projects;
}
