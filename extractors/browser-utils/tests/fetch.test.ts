import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCapsolverProxyUrl,
  isCapsolverConfigured,
} from "../src/capsolver-config.js";
import { saveClearanceCookies } from "../src/cookies.js";
import { createCloudflareFetch } from "../src/fetch.js";

const mock = vi.hoisted(() => ({ constructor: vi.fn(), fetch: vi.fn() }));
vi.mock("impit", () => ({
  Impit: class {
    fetch = mock.fetch;
    constructor(options: unknown) {
      mock.constructor(options);
    }
  },
}));

describe("Cloudflare retry transport", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "jobops-cf-fetch-"));
    vi.stubEnv("CAPSOLVER_API_KEY", "");
    vi.stubEnv("CAPSOLVER_PROXY", "http://user:secret@proxy.example:8080");
    mock.constructor.mockClear();
    mock.fetch.mockReset().mockResolvedValue({ status: 200 });
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  it("treats blank keys as disabled and ignores the proxy in manual mode", async () => {
    vi.stubEnv("CAPSOLVER_API_KEY", "  ");
    expect(isCapsolverConfigured()).toBe(false);
    expect(getCapsolverProxyUrl()).toBeUndefined();
    await createCloudflareFetch("gradcracker", dir);
    expect(mock.constructor.mock.calls[0][0]).toMatchObject({
      browser: "firefox",
    });
    expect(mock.constructor.mock.calls[0][0]).not.toHaveProperty("proxyUrl");
  });

  it("uses the same proxy, Chrome fingerprint, UA and scoped clearance jar for retries", async () => {
    vi.stubEnv("CAPSOLVER_API_KEY", "key");
    await saveClearanceCookies(
      "gradcracker",
      "https://www.gradcracker.com/",
      { cf_clearance: "tenant-a-clearance" },
      "Chrome/141.0",
      dir,
    );
    await createCloudflareFetch("gradcracker", dir);
    const options = mock.constructor.mock.calls[0][0];
    expect(options).toMatchObject({
      browser: "chrome",
      proxyUrl: "http://user:secret@proxy.example:8080/",
      headers: { "user-agent": "Chrome/141.0" },
    });
    expect(
      await options.cookieJar.getCookieString("https://www.gradcracker.com/"),
    ).toBe("cf_clearance=tenant-a-clearance");
    await createCloudflareFetch("gradcracker", join(dir, "tenant-b"));
    expect(
      await mock.constructor.mock.calls[1][0].cookieJar.getCookieString(
        "https://www.gradcracker.com/",
      ),
    ).toBe("");
  });

  it("never echoes proxy credentials in configuration or transport errors", async () => {
    vi.stubEnv("CAPSOLVER_API_KEY", "key");
    vi.stubEnv("CAPSOLVER_PROXY", "socks5://user:secret@proxy.example:8080");
    expect(() => getCapsolverProxyUrl()).toThrow(
      "must be an HTTP(S) proxy URL",
    );
    vi.stubEnv("CAPSOLVER_PROXY", "http://user:secret@proxy.example:8080");
    const fetchPage = await createCloudflareFetch("gradcracker", dir);
    mock.fetch.mockRejectedValue(new Error("proxy user:secret refused"));
    await expect(fetchPage("https://www.gradcracker.com/")).rejects.toThrow(
      "Job board request through CAPSOLVER_PROXY failed.",
    );
  });
});
