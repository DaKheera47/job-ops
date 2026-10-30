import { lookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request } from "node:https";
import { isIP } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 &&
        (b === 168 ||
          (b === 0 && (c === 0 || c === 2)) ||
          (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const [a, b] = address
      .split(":")
      .map((part) => Number.parseInt(part || "0", 16));
    // Only global unicast; exclude transition, documentation and special-purpose ranges.
    return (
      a >= 0x2000 &&
      a <= 0x3fff &&
      a !== 0x2002 &&
      !(a === 0x2001 && (b <= 0x1ff || b === 0xdb8)) &&
      !(a === 0x3fff && b <= 0xfff)
    );
  }
  return false;
}

export function parsePublicAshbyPageUrl(input: string): URL {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    !url.hostname.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname)
  ) {
    throw new Error(
      "Careers pages must use a public HTTPS hostname without credentials or a custom port.",
    );
  }
  url.hash = "";
  return url;
}

export async function readPublicAshbyUrl(
  input: string,
  options: {
    signal?: AbortSignal;
    maxBytes: number;
    accept: string;
  },
): Promise<{ text: string; url: string }> {
  const signal = AbortSignal.any([
    AbortSignal.timeout(30_000),
    ...(options.signal ? [options.signal] : []),
  ]);
  let url = parsePublicAshbyPageUrl(input);
  let retries = 0;
  for (let redirects = 0; redirects <= 5; ) {
    signal.throwIfAborted();
    const dnsDeadline = new AbortController();
    const addresses = await Promise.race([
      lookup(url.hostname, { all: true }),
      delay(30_000, undefined, {
        signal: AbortSignal.any([signal, dnsDeadline.signal]),
      }).then(() => {
        throw new Error("Ashby DNS lookup timed out.");
      }),
    ]).finally(() => dnsDeadline.abort());
    signal.throwIfAborted();
    if (
      !addresses.length ||
      addresses.some(({ address }) => !isPublicAddress(address))
    ) {
      throw new Error(
        "Careers page DNS must resolve only to public addresses.",
      );
    }
    const address = addresses.find((item) => item.family === 4) ?? addresses[0];
    const response = await new Promise<IncomingMessage>((resolve, reject) => {
      const req = request(
        url,
        {
          signal,
          agent: false,
          family: address.family,
          // Keep TLS/Host intact while pinning the vetted address against DNS rebinding.
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
          headers: {
            accept: options.accept,
            "accept-encoding": "identity",
            "user-agent": "JobOps/1.0 (public Ashby careers reader)",
          },
        },
        resolve,
      );
      req.on("error", () =>
        reject(new Error("Could not fetch the public Ashby careers source.")),
      );
      req.end();
    });
    try {
      const status = response.statusCode ?? 502;
      if (
        [301, 302, 303, 307, 308].includes(status) &&
        response.headers.location
      ) {
        url = parsePublicAshbyPageUrl(
          new URL(response.headers.location, url).href,
        );
        redirects += 1;
        continue;
      }
      if ((status === 429 || status >= 500) && retries++ === 0) {
        const seconds = Number(response.headers["retry-after"] ?? 1);
        if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 2) {
          response.destroy();
          await delay(seconds * 1000, undefined, { signal });
          continue;
        }
      }
      if (status !== 200)
        throw new Error(`Ashby careers request failed with HTTP ${status}.`);
      if (
        (response.headers["content-encoding"] &&
          response.headers["content-encoding"] !== "identity") ||
        Number(response.headers["content-length"] ?? 0) > options.maxBytes
      ) {
        throw new Error(
          "Ashby response exceeds the supported size or encoding.",
        );
      }
      if (
        !options.accept
          .split(",")
          .some((type) =>
            response.headers["content-type"]?.toLowerCase().startsWith(type),
          )
      ) {
        throw new Error("Ashby response has an unsupported content type.");
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of response) {
        bytes += chunk.length;
        if (bytes > options.maxBytes)
          throw new Error("Ashby response exceeds the supported size.");
        chunks.push(chunk);
      }
      return { text: Buffer.concat(chunks).toString("utf8"), url: url.href };
    } finally {
      response.destroy();
    }
  }
  throw new Error("Ashby careers page redirected too many times.");
}
