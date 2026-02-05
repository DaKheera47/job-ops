import type { LlmProvider } from "../types";

export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function addQueryParam(url: string, key: string, value: string): string {
  const connector = url.includes("?") ? "&" : "?";
  return `${url}${connector}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

export function buildHeaders(args: {
  apiKey: string | null;
  provider: LlmProvider;
}): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (args.apiKey) {
    headers.Authorization = `Bearer ${args.apiKey}`;
  }

  if (args.provider === "openrouter") {
    headers["HTTP-Referer"] = "JobOps";
    headers["X-Title"] = "JobOpsOrchestrator";
  }

  return headers;
}

export async function getResponseDetail(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (payload && typeof payload === "object" && "error" in payload) {
      const errorObj = payload.error as {
        message?: string;
        code?: number | string;
      };
      const message = errorObj?.message || "";
      const code = errorObj?.code ? ` (${errorObj.code})` : "";
      return `${message}${code}`.trim();
    }
  } catch {
    // ignore JSON parse errors
  }

  return response.text().catch(() => "");
}
