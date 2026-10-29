import { setTimeout as delay } from "node:timers/promises";
import {
  createCloudflareFetch,
  getCapsolverProxyUrl,
  isChallengeHtml,
  saveClearanceCookies,
} from "browser-utils";
import { z } from "zod";

const API_URL = "https://api.capsolver.com";
const SOLVE_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 5_000;
const ALLOWED_ORIGINS: Record<string, string> = {
  gradcracker: "https://www.gradcracker.com",
  hiringcafe: "https://hiringcafe.com",
};

const responseSchema = z.object({
  errorId: z.number(),
  errorCode: z.string().nullish(),
  taskId: z.string().optional(),
  status: z.string().optional(),
  solution: z
    .object({
      cookies: z.record(z.string()),
      userAgent: z.string().min(1),
    })
    .nullish(),
});

/** Only controlled messages may reach logs, run history, or SSE. */
export class CapsolverError extends Error {}

function apiFailure(code?: string | null): CapsolverError {
  switch (code) {
    case "ERROR_KEY_DENIED_ACCESS":
    case "ERROR_KEY_DOES_NOT_EXIST":
      return new CapsolverError("CapSolver rejected CAPSOLVER_API_KEY.");
    case "ERROR_ZERO_BALANCE":
      return new CapsolverError("CapSolver has insufficient balance.");
    case "ERROR_PROXY_BANNED":
      return new CapsolverError("The job board blocked CAPSOLVER_PROXY.");
    case "ERROR_TASK_TIMEOUT":
      return new CapsolverError("CapSolver solve timed out.");
    default:
      return new CapsolverError("CapSolver could not solve the browser check.");
  }
}

/** Uses the documented AntiCloudflareTask flow, not a Turnstile widget token. */
export async function solveWithCapsolver(args: {
  extractorId: string;
  url: string;
  storageDir: string;
  signal: AbortSignal;
}): Promise<void> {
  const apiKey = process.env.CAPSOLVER_API_KEY?.trim();
  const proxy = getCapsolverProxyUrl();
  if (!apiKey || !proxy) {
    throw new CapsolverError(
      "Automatic Cloudflare solving requires CAPSOLVER_API_KEY and CAPSOLVER_PROXY (a static or sticky HTTP(S) proxy).",
    );
  }
  const url = new URL(args.url);
  if (
    !Object.hasOwn(ALLOWED_ORIGINS, args.extractorId) ||
    ALLOWED_ORIGINS[args.extractorId] !== url.origin
  ) {
    throw new CapsolverError("CapSolver is not supported for this job board.");
  }

  const controller = new AbortController();
  const abort = () => controller.abort();
  args.signal.addEventListener("abort", abort, { once: true });
  if (args.signal.aborted) abort();
  const timeout = setTimeout(abort, SOLVE_TIMEOUT_MS);
  const signal = controller.signal;

  const request = async (
    method: "createTask" | "getTaskResult",
    payload: Record<string, unknown>,
  ) => {
    const response = await fetch(`${API_URL}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, ...payload }),
      signal,
    });
    if (response.status === 401) throw apiFailure("ERROR_KEY_DENIED_ACCESS");
    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) throw apiFailure();
    if (!response.ok || parsed.data.errorId !== 0)
      throw apiFailure(parsed.data.errorCode);
    return parsed.data;
  };

  try {
    signal.throwIfAborted();
    // Get fresh challenge HTML through the same egress IP as both the solver
    // and the extractor retry. No profile/resume data is sent to CapSolver.
    const fetchPage = await createCloudflareFetch(
      args.extractorId,
      args.storageDir,
    );
    const page = await fetchPage(args.url, { signal });
    const html = await page.text();
    if (/Vercel Security Checkpoint|vercel-protection|_vcrcs/i.test(html)) {
      throw new CapsolverError(
        "CapSolver does not support Vercel browser checks.",
      );
    }
    // A transient check may already have cleared. Retry without buying a solve.
    if (page.ok && !isChallengeHtml(html)) return;
    const task = await request("createTask", {
      task: { type: "AntiCloudflareTask", websiteURL: args.url, proxy, html },
    });
    if (!task.taskId) throw apiFailure();

    let result = task;
    while (result.status !== "ready") {
      await delay(POLL_INTERVAL_MS, undefined, { signal });
      result = await request("getTaskResult", { taskId: task.taskId });
    }
    const solution = result.solution;
    if (!solution?.cookies.cf_clearance) throw apiFailure();
    signal.throwIfAborted();
    await saveClearanceCookies(
      args.extractorId,
      args.url,
      solution.cookies,
      solution.userAgent,
      args.storageDir,
    );
  } catch (error) {
    if (error instanceof CapsolverError) throw error;
    if (signal.aborted) {
      throw new CapsolverError(
        args.signal.aborted
          ? "CapSolver solve cancelled."
          : "CapSolver solve timed out.",
      );
    }
    // Fetch errors and upstream bodies can echo API keys or proxy credentials.
    throw apiFailure();
  } finally {
    clearTimeout(timeout);
    args.signal.removeEventListener("abort", abort);
  }
}
