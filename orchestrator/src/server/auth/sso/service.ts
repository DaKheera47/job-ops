import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serviceUnavailable,
  unauthorized,
} from "@infra/errors";
import { signToken } from "@server/auth/jwt";
import { getJobOpsAppConfig } from "@server/config/app-mode";
import type { SsoIdentity } from "@server/repositories/sso-identities";
import * as ssoIdentitiesRepo from "@server/repositories/sso-identities";
import * as usersRepo from "@server/repositories/users";
import type { SsoIdentitySummary, SsoProvider } from "@shared/types";
import type { SsoIdentityClaims } from "./client";
import { getSsoProviderConfig, type SsoProviderConfig } from "./config";

export type SsoLoginResult = {
  token: string;
  expiresIn: number;
  user: usersRepo.PublicUser;
  created: boolean;
};

const USERNAME_SUFFIX_LIMIT = 20;

export function toSsoIdentitySummary(
  identity: SsoIdentity,
): SsoIdentitySummary {
  return {
    id: identity.id,
    provider: identity.provider,
    email: identity.email,
    displayName: identity.displayName,
    createdAt: identity.createdAt,
  };
}

function requireProviderConfig(provider: SsoProvider): SsoProviderConfig {
  const config = getSsoProviderConfig(provider);
  if (!config) {
    throw notFound(`SSO provider ${provider} is not enabled`);
  }
  return config;
}

function isUsernameConflictError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /UNIQUE constraint failed: users\.username/i.test(error.message);
}

function buildUsernameAttempts(
  provider: SsoProvider,
  claims: SsoIdentityClaims,
): string[] {
  const base =
    [
      claims.preferredUsername,
      claims.email?.split("@")[0],
      `${provider}-${claims.subject.slice(0, 8)}`,
    ]
      .map((candidate) => usersRepo.normalizeUsername(candidate ?? ""))
      .find((candidate) => candidate.length > 0) ?? provider;

  const attempts = [base];
  for (let suffix = 2; suffix <= USERNAME_SUFFIX_LIMIT; suffix += 1) {
    attempts.push(`${base}-${suffix}`);
  }
  return attempts;
}

/**
 * Only a single-`@` address has an unambiguous domain: the mailbox of
 * `person@example.com@evil.test` lives at `evil.test`, so taking the segment
 * after the first `@` would match an allowlist entry for `example.com`.
 */
function readEmailDomain(email: string | null): string {
  const normalized = email?.toLowerCase() ?? "";
  const at = normalized.indexOf("@");
  if (at < 0 || normalized.includes("@", at + 1)) return "";
  return normalized.slice(at + 1);
}

/**
 * Google and GitHub let anyone hold an identity, so a verified email in an
 * allowed domain is what separates a colleague from a stranger. A self-hosted
 * OIDC provider already decides who may authenticate, so its allowlist is
 * optional.
 */
function assertSignupAllowed(
  config: SsoProviderConfig,
  claims: SsoIdentityClaims,
): void {
  if (config.id === "oidc" && config.allowedEmailDomains.length === 0) return;

  const domain = readEmailDomain(claims.email);
  if (
    !claims.emailVerified ||
    !domain ||
    !config.allowedEmailDomains.includes(domain)
  ) {
    throw forbidden(
      "This identity is not allowed to create an account on this instance",
    );
  }
}

async function provisionSsoUser(input: {
  provider: SsoProvider;
  claims: SsoIdentityClaims;
}): Promise<usersRepo.PublicUser> {
  const appConfig = getJobOpsAppConfig();
  const hostedTenantId =
    appConfig.appMode === "hosted" ? appConfig.hostedTenantId : null;

  if (appConfig.appMode === "hosted") {
    if (!appConfig.capabilities.hostedSignups) {
      throw forbidden("Hosted signups are disabled");
    }
    if (!hostedTenantId) {
      throw serviceUnavailable("Hosted tenant is not configured");
    }
  } else if ((await usersRepo.countUsers()) === 0) {
    // The first admin owns the instance, so they must come through the setup
    // wizard rather than whoever reaches the IdP first.
    throw badRequest("Initial setup is required");
  }

  const displayName = input.claims.displayName;

  for (const username of buildUsernameAttempts(input.provider, input.claims)) {
    try {
      const user = hostedTenantId
        ? await usersRepo.createSsoProvisionedUser({
            mode: "hosted",
            username,
            displayName,
            tenantId: hostedTenantId,
          })
        : await usersRepo.createSsoProvisionedUser({
            mode: "local",
            username,
            displayName,
          });
      if (!user) {
        throw serviceUnavailable("Configured hosted tenant is not available");
      }
      return user;
    } catch (error) {
      if (!isUsernameConflictError(error)) throw error;
    }
  }

  throw conflict("Could not allocate a username for this identity");
}

export async function completeSsoLogin(input: {
  provider: SsoProvider;
  claims: SsoIdentityClaims;
}): Promise<SsoLoginResult> {
  const config = requireProviderConfig(input.provider);
  const identity = await ssoIdentitiesRepo.findSsoIdentity({
    provider: input.provider,
    issuer: input.claims.issuer,
    subject: input.claims.subject,
  });

  if (identity) {
    const user = await usersRepo.getUserById(identity.userId);
    const appConfig = getJobOpsAppConfig();
    if (
      !user ||
      user.isDisabled ||
      (appConfig.appMode === "hosted" &&
        user.workspaceId !== appConfig.hostedTenantId)
    ) {
      throw unauthorized("Invalid credentials");
    }
    const { token, expiresIn } = await signToken({
      sub: user.id,
      userId: user.id,
      tenantId: user.workspaceId,
      username: user.username,
      isSystemAdmin: user.isSystemAdmin,
    });
    return { token, expiresIn, user, created: false };
  }

  if (!config.allowSignup) {
    throw forbidden(
      `No JobOps account is linked to this ${config.displayName} identity. Sign in with your password and connect it under Settings → Workspace Access.`,
    );
  }
  assertSignupAllowed(config, input.claims);

  const user = await provisionSsoUser(input);
  await ssoIdentitiesRepo.createSsoIdentity({
    tenantId: user.workspaceId,
    userId: user.id,
    provider: input.provider,
    issuer: input.claims.issuer,
    subject: input.claims.subject,
    email: input.claims.email,
    displayName: input.claims.displayName,
  });

  const { token, expiresIn } = await signToken({
    sub: user.id,
    userId: user.id,
    tenantId: user.workspaceId,
    username: user.username,
    isSystemAdmin: user.isSystemAdmin,
  });
  return { token, expiresIn, user, created: true };
}

export async function linkSsoIdentity(input: {
  provider: SsoProvider;
  claims: SsoIdentityClaims;
  userId: string;
  tenantId: string;
}): Promise<{ identity: SsoIdentitySummary; created: boolean }> {
  const config = requireProviderConfig(input.provider);
  const existing = await ssoIdentitiesRepo.findSsoIdentity({
    provider: input.provider,
    issuer: input.claims.issuer,
    subject: input.claims.subject,
  });

  if (existing) {
    if (existing.userId !== input.userId) {
      throw conflict(
        `This ${config.displayName} account is already linked to a different user`,
      );
    }
    return { identity: toSsoIdentitySummary(existing), created: false };
  }

  const identity = await ssoIdentitiesRepo.createSsoIdentity({
    tenantId: input.tenantId,
    userId: input.userId,
    provider: input.provider,
    issuer: input.claims.issuer,
    subject: input.claims.subject,
    email: input.claims.email,
    displayName: input.claims.displayName,
  });
  return { identity: toSsoIdentitySummary(identity), created: true };
}

export async function unlinkSsoIdentity(input: {
  id: string;
  userId: string;
}): Promise<void> {
  const user = await usersRepo.getUserById(input.userId);
  if (!user) {
    throw unauthorized("Authentication required");
  }

  if (
    !user.hasPassword &&
    (await ssoIdentitiesRepo.countSsoIdentitiesForUser(input.userId)) <= 1
  ) {
    throw badRequest("Set a password before removing your last sign-in method");
  }

  const deleted = await ssoIdentitiesRepo.deleteSsoIdentity({
    id: input.id,
    userId: input.userId,
  });
  if (!deleted) {
    throw notFound("Connected account not found");
  }
}
