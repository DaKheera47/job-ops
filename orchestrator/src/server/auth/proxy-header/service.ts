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
  const value = req.headers[name];
  // A repeated header is ambiguous; refuse it rather than pick one.
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
