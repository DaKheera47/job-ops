import { lookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import {
  AppError,
  requestTimeout,
  serviceUnavailable,
  unprocessableEntity,
  upstreamError,
} from "@infra/errors";
import { Agent, buildConnector, fetch, getGlobalDispatcher } from "undici";

const MAX_REDIRECTS = 5;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const globalIPv6 = new BlockList();
globalIPv6.addSubnet("2000::", 3, "ipv6");

const nonpublicAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const) {
  nonpublicAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3ffe::", 16],
  ["3fff::", 20],
] as const) {
  nonpublicAddresses.addSubnet(network, prefix, "ipv6");
}
// Azure's internal platform address is outside the special-use ranges.
nonpublicAddresses.addAddress("168.63.129.16", "ipv4");

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !nonpublicAddresses.check(address, "ipv4");
  return (
    family === 6 &&
    globalIPv6.check(address, "ipv6") &&
    !nonpublicAddresses.check(address, "ipv6")
  );
}

function publicDestinationRequired() {
  return unprocessableEntity(
    "Auto-fetch requires a public HTTP or HTTPS URL. Paste the job description manually.",
  );
}

function checkDestination(url: URL) {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    !hostname ||
    // The socket can skip DNS lookup for IP literals.
    (isIP(hostname) && !isPublicAddress(hostname))
  ) {
    throw publicDestinationRequired();
  }
}

function buildFetchFailureMessage(status: number): string {
  if (status === 401 || status === 403 || status === 429) {
    return "This site blocks automated fetch requests. Paste the job description manually.";
  }
  if (status === 404) {
    return "We couldn't find that page. Check the URL or paste the job description manually.";
  }
  return "Couldn't fetch this URL automatically. Paste the job description manually.";
}

export async function fetchManualJobPage(
  inputUrl: string,
  signal: AbortSignal,
) {
  // A proxy can resolve the destination independently of our socket lookup.
  if (getGlobalDispatcher().constructor.name === "EnvHttpProxyAgent") {
    throw serviceUnavailable(
      "Auto-fetch is unavailable while Node's outbound proxy mode is enabled. Paste the job description manually.",
    );
  }

  const connect = buildConnector({
    signal,
    // Return only vetted answers to the socket while retaining the URL's Host and TLS identity.
    lookup(hostname, options, callback) {
      lookup(hostname, { ...options, all: true }, (error, addresses) => {
        if (signal.aborted) return callback(requestTimeout(), "", 0);
        if (error) return callback(error, "", 0);
        if (
          !addresses.length ||
          addresses.some(({ address }) => !isPublicAddress(address))
        ) {
          return callback(publicDestinationRequired(), "", 0);
        }
        if (options.all) return callback(null, addresses);
        const { address, family } = addresses[0];
        callback(null, address, family);
      });
    },
  });
  const dispatcher = new Agent({
    connect(options, callback) {
      if (signal.aborted) return callback(requestTimeout(), null);
      connect(options, callback);
    },
  });

  try {
    let url = new URL(inputUrl);
    for (let redirects = 0; ; redirects++) {
      checkDestination(url);
      const response = await fetch(url, {
        dispatcher,
        redirect: "manual",
        signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      });

      const location = response.headers.get("location");
      if (location && REDIRECT_STATUSES.has(response.status)) {
        if (redirects >= MAX_REDIRECTS) {
          throw upstreamError(
            "This site redirects too many times. Paste the job description manually.",
          );
        }
        await response.body?.cancel();
        url = new URL(location, url);
        continue;
      }

      if (!response.ok) {
        throw upstreamError(buildFetchFailureMessage(response.status), {
          upstreamStatus: response.status,
        });
      }

      const chunks: Uint8Array[] = [];
      let bytes = 0;
      for await (const chunk of response.body ?? []) {
        bytes += chunk.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          throw upstreamError(
            "This page is too large to fetch automatically. Paste the job description manually.",
          );
        }
        chunks.push(chunk);
      }
      return Buffer.concat(chunks, bytes).toString("utf8");
    }
  } catch (error) {
    if (signal.aborted) throw requestTimeout();
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.cause instanceof AppError) {
      throw error.cause;
    }
    throw upstreamError(buildFetchFailureMessage(0));
  } finally {
    await dispatcher.destroy();
  }
}
