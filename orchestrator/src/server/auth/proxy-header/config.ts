import { BlockList, isIP } from "node:net";
import { logger } from "@infra/logger";

export type ProxyAuthConfig = {
  userHeader: string;
  displayNameHeader: string | null;
  allowSignup: boolean;
  trustedProxies: BlockList;
};

type EnvSource = Pick<NodeJS.ProcessEnv, string>;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const DEFAULT_USER_HEADER = "x-remote-user";

// The config is rebuilt from the environment per request, so a misconfigured
// instance would otherwise repeat this warning on every request.
let warnedMissingTrustedProxies = false;

function readTrimmedEnv(env: EnvSource, key: string): string {
  return env[key]?.trim() ?? "";
}

/**
 * Accepts bare addresses (`10.0.0.5`) and CIDR ranges (`172.18.0.0/16`).
 * Entries that cannot be parsed are skipped rather than widening the trust.
 */
function buildTrustedProxyList(raw: string): {
  list: BlockList;
  entries: number;
} {
  const list = new BlockList();
  let entries = 0;

  for (const part of raw.split(",")) {
    const entry = part.trim();
    if (!entry) continue;

    const [address = "", prefix] = entry.split("/");
    const family = isIP(address);
    if (family === 0) {
      logger.warn("Ignoring invalid PROXY_AUTH_TRUSTED_PROXIES entry", {
        entry,
      });
      continue;
    }
    const type = family === 4 ? "ipv4" : "ipv6";

    if (prefix === undefined) {
      list.addAddress(address, type);
      entries += 1;
      continue;
    }

    const bits = Number(prefix);
    const maxBits = family === 4 ? 32 : 128;
    if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) {
      logger.warn("Ignoring invalid PROXY_AUTH_TRUSTED_PROXIES entry", {
        entry,
      });
      continue;
    }
    list.addSubnet(address, bits, type);
    entries += 1;
  }

  return { list, entries };
}

/**
 * Proxy header auth is off unless explicitly enabled, and it stays off without
 * a trusted proxy list: otherwise any client could forge the header.
 */
export function getProxyAuthConfig(
  env: EnvSource = process.env,
): ProxyAuthConfig | null {
  const enabled = TRUE_VALUES.has(
    readTrimmedEnv(env, "PROXY_AUTH_ENABLED").toLowerCase(),
  );
  if (!enabled) return null;

  const { list, entries } = buildTrustedProxyList(
    readTrimmedEnv(env, "PROXY_AUTH_TRUSTED_PROXIES"),
  );
  if (entries === 0) {
    if (!warnedMissingTrustedProxies) {
      warnedMissingTrustedProxies = true;
      logger.warn(
        "Ignoring PROXY_AUTH_ENABLED because PROXY_AUTH_TRUSTED_PROXIES has no valid entries",
      );
    }
    return null;
  }

  return {
    userHeader: (
      readTrimmedEnv(env, "PROXY_AUTH_USER_HEADER") || DEFAULT_USER_HEADER
    ).toLowerCase(),
    displayNameHeader:
      readTrimmedEnv(env, "PROXY_AUTH_NAME_HEADER").toLowerCase() || null,
    allowSignup: TRUE_VALUES.has(
      readTrimmedEnv(env, "PROXY_AUTH_ALLOW_SIGNUP").toLowerCase(),
    ),
    trustedProxies: list,
  };
}

/** Node reports IPv4 peers as `::ffff:a.b.c.d` on dual-stack sockets. */
export function isTrustedProxyAddress(
  config: ProxyAuthConfig,
  remoteAddress: string | undefined,
): boolean {
  if (!remoteAddress) return false;
  const address = remoteAddress.replace(/^::ffff:/i, "");
  const family = isIP(address);
  if (family === 0) return false;
  return config.trustedProxies.check(address, family === 4 ? "ipv4" : "ipv6");
}
