import { Impit } from "impit";
import {
  getCapsolverProxyUrl,
  isCapsolverConfigured,
} from "./capsolver-config.js";
import { createPersistedFetchCookieJar } from "./cookies.js";

/** Reuse clearance cookies, their user agent, and the solver's egress IP. */
export async function createCloudflareFetch(
  extractorId: string,
  storageDir?: string,
) {
  const persisted = await createPersistedFetchCookieJar(
    extractorId,
    storageDir,
  );
  const automatic = isCapsolverConfigured();
  const proxyUrl = getCapsolverProxyUrl();
  const impit = new Impit({
    browser:
      automatic || persisted.userAgent?.includes("Chrome/")
        ? "chrome"
        : "firefox",
    timeout: 30_000,
    cookieJar: persisted.cookieJar,
    ...(proxyUrl ? { proxyUrl } : {}),
    ...(persisted.userAgent
      ? { headers: { "user-agent": persisted.userAgent } }
      : {}),
  });

  return async (input: string | URL, init?: RequestInit) => {
    try {
      return await impit.fetch(input, init as Parameters<Impit["fetch"]>[1]);
    } catch (error) {
      if (proxyUrl) {
        throw new Error("Job board request through CAPSOLVER_PROXY failed.");
      }
      throw error;
    }
  };
}
