import { lookup } from "node:dns/promises";
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
  options: { signal?: AbortSignal; maxBytes: number; accept: string },
): Promise<{ text: string; url: string }> {
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000);
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
    const result = await new Promise<{
      status: number;
      location?: string;
      retryAfter?: string;
      text: string;
    }>((resolve, reject) => {
      const req = request(
        url,
        {
          method: "GET",
          signal,
          agent: false,
          family: address.family,
          // Pin the checked address while retaining the original hostname for TLS and Host.
          lookup: (_hostname, _options, callback) =>
            callback(null, address.address, address.family),
          headers: {
            accept: options.accept,
            "accept-encoding": "identity",
            "user-agent": "JobOps/1.0 (public Ashby careers reader)",
          },
        },
        (res) => {
          const status = res.statusCode ?? 502;
          if (status !== 200) {
            res.destroy();
            resolve({
              status,
              location: res.headers.location,
              retryAfter: res.headers["retry-after"],
              text: "",
            });
            return;
          }
          if (
            (res.headers["content-encoding"] &&
              res.headers["content-encoding"] !== "identity") ||
            Number(res.headers["content-length"] ?? 0) > options.maxBytes
          ) {
            res.destroy();
            reject(
              new Error(
                "Ashby response exceeds the supported size or encoding.",
              ),
            );
            return;
          }
          const contentType = res.headers["content-type"] ?? "";
          if (
            !options.accept
              .split(",")
              .some((type) => contentType.toLowerCase().startsWith(type))
          ) {
            res.destroy();
            reject(
              new Error("Ashby response has an unsupported content type."),
            );
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          res.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > options.maxBytes) {
              res.destroy(
                new Error("Ashby response exceeds the supported size."),
              );
            } else chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve({ status, text: Buffer.concat(chunks).toString("utf8") }),
          );
        },
      );
      req.on("error", () =>
        reject(
          new Error(
            signal.aborted
              ? "Ashby request timed out or was cancelled."
              : "Could not fetch the public Ashby careers source.",
          ),
        ),
      );
      req.end();
    });
    if ([301, 302, 303, 307, 308].includes(result.status) && result.location) {
      url = parsePublicAshbyPageUrl(new URL(result.location, url).href);
      redirects += 1;
      continue;
    }
    if ((result.status === 429 || result.status >= 500) && retries++ === 0) {
      const retrySeconds = result.retryAfter ? Number(result.retryAfter) : 1;
      if (
        Number.isFinite(retrySeconds) &&
        retrySeconds >= 0 &&
        retrySeconds <= 2
      ) {
        await delay(retrySeconds * 1000, undefined, { signal });
        continue;
      }
    }
    if (result.status !== 200)
      throw new Error(
        `Ashby careers request failed with HTTP ${result.status}.`,
      );
    return { text: result.text, url: url.href };
  }
  throw new Error("Ashby careers page redirected too many times.");
}
