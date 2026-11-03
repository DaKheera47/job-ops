import { badRequest, forbidden, notFound, unauthorized } from "@infra/errors";
import { logger } from "@infra/logger";
import { signToken } from "@server/auth/jwt";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import * as usersRepo from "@server/repositories/users";
import type { Request } from "express";
import {
  getProxyAuthConfig,
  isTrustedProxyAddress,
  type ProxyAuthConfig,
} from "./config";

export type ProxyLoginResult = {
  token: string;
  expiresIn: number;
  user: usersRepo.PublicUser;
  created: boolean;
};

const MAX_HEADER_LENGTH = 200;

function readSingleHeader(req: Request, name: string): string | null {
  // Node folds repeated fields into one "a, b" string, so count them in the
  // raw list: a repeated header is ambiguous and is refused, not picked from.
  let occurrences = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index]?.toLowerCase() === name) occurrences += 1;
  }
  if (occurrences !== 1) return null;

  const value = req.headers[name];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_HEADER_LENGTH) return null;
  return trimmed;
}

function resolveConfig(req: Request): ProxyAuthConfig {
  const config = getProxyAuthConfig();
  if (!config) throw notFound("Proxy authentication is not enabled");

  if (!isTrustedProxyAddress(config, req.socket.remoteAddress)) {
    logger.warn("Rejected proxy authentication from untrusted address", {
      remoteAddress: req.socket.remoteAddress,
    });
    throw forbidden("Request did not come from a trusted proxy");
  }
  return config;
}

function readHost(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).host;
  } catch {
    return null;
  }
}

/**
 * The app answers cross-origin requests with an open CORS policy, so a trusted
 * peer (for example loopback) is not enough on its own: any web page in the
 * user's browser could post to this endpoint with a header it chose and read
 * the token back. A request that a browser marks as cross-origin is refused.
 * Non-browser clients send neither header and pass.
 */
function assertNotCrossOrigin(req: Request): void {
  const fetchSite = req.headers["sec-fetch-site"];
  if (typeof fetchSite === "string") {
    if (fetchSite !== "same-origin" && fetchSite !== "none") {
      throw forbidden("Cross-origin proxy sign-in is not allowed");
    }
    return;
  }

  // Browsers without Fetch Metadata still send Origin on a POST.
  const origin = req.headers.origin;
  if (origin === undefined) return;

  const originHost = typeof origin === "string" ? readHost(origin) : null;
  const allowedHosts = new Set(
    [
      req.headers.host,
      process.env.JOBOPS_PUBLIC_BASE_URL,
      process.env.SSO_REDIRECT_BASE_URL,
    ]
      .map((value) => readHost(value?.trim()))
      .filter((host): host is string => host !== null),
  );
  if (!originHost || !allowedHosts.has(originHost)) {
    throw forbidden("Cross-origin proxy sign-in is not allowed");
  }
}

export function isProxyAuthEnabled(): boolean {
  return (
    getJobOpsAppConfig().appMode !== "hosted" && getProxyAuthConfig() !== null
  );
}

/**
 * Exchanges the identity a trusted reverse proxy already authenticated for a
 * regular JobOps session token. Passwords never cross this path.
 */
export async function completeProxyLogin(
  req: Request,
): Promise<ProxyLoginResult> {
  if (!isProxyAuthEnabled()) {
    throw notFound("Proxy authentication is not enabled");
  }

  const config = resolveConfig(req);
  assertNotCrossOrigin(req);

  const rawUsername = readSingleHeader(req, config.userHeader);
  const username = rawUsername ? usersRepo.normalizeUsername(rawUsername) : "";
  if (!username) {
    throw unauthorized("Authentication required");
  }

  // The first admin owns the instance, so they come through the setup wizard
  // rather than whoever the proxy lets through first.
  if ((await usersRepo.countUsers()) === 0) {
    throw badRequest("Initial setup is required");
  }

  const existing = await usersRepo.getUserForLogin(username);
  let user: usersRepo.PublicUser | null = null;
  let created = false;

  if (existing) {
    if (existing.isDisabled) throw unauthorized("Invalid credentials");
    user = await usersRepo.getUserById(existing.id);
  } else if (config.allowSignup) {
    const displayName = config.displayNameHeader
      ? readSingleHeader(req, config.displayNameHeader)
      : null;
    user = await usersRepo.createSsoProvisionedUser({
      mode: "local",
      username,
      displayName,
    });
    created = true;
  } else {
    throw forbidden(
      "No JobOps account exists for this user. Ask an admin to create one or enable PROXY_AUTH_ALLOW_SIGNUP.",
    );
  }

  if (!user || user.isDisabled) throw unauthorized("Invalid credentials");

  const { token, expiresIn } = await signToken({
    sub: user.id,
    userId: user.id,
    tenantId: user.workspaceId,
    username: user.username,
    isSystemAdmin: user.isSystemAdmin,
  });
  return { token, expiresIn, user, created };
}
