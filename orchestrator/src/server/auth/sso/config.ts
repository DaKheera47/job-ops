import { logger } from "@infra/logger";
import { resolveRequestOrigin } from "@server/infra/request-origin";
import type { SsoProvider, SsoProviderInfo } from "@shared/types";
import type { Request } from "express";

export type SsoProviderConfig = {
  id: SsoProvider;
  displayName: string;
  clientId: string;
  clientSecret: string | null;
  issuerUrl: string;
  scopes: string;
  allowSignup: boolean;
  allowedEmailDomains: string[];
  allowInsecureHttp: boolean;
};

type EnvSource = Pick<NodeJS.ProcessEnv, string>;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off", ""]);

const GOOGLE_ISSUER_URL = "https://accounts.google.com";
const GITHUB_ISSUER_URL = "https://github.com";
const GOOGLE_SCOPES = "openid email profile";
const GITHUB_SCOPES = "read:user user:email";
const DEFAULT_OIDC_SCOPES = "openid profile email";
const DEFAULT_OIDC_DISPLAY_NAME = "SSO";

// The configs are rebuilt from the environment per request, so a misconfigured
// instance would otherwise repeat these warnings on every request.
const warnedOpenSignupProviders = new Set<SsoProvider>();
const warnedUnparseableFlagKeys = new Set<string>();

function readTrimmedEnv(env: EnvSource, key: string): string {
  return env[key]?.trim() ?? "";
}

function parseBooleanFlag(
  env: EnvSource,
  key: string,
  defaultValue: boolean,
): boolean {
  const raw = env[key];
  if (raw === undefined) return defaultValue;

  const normalized = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;

  if (!warnedUnparseableFlagKeys.has(key)) {
    warnedUnparseableFlagKeys.add(key);
    logger.warn("Ignoring unparseable SSO boolean flag", {
      key,
      value: normalized,
      defaultValue,
    });
  }
  return defaultValue;
}

function parseEmailDomains(env: EnvSource, key: string): string[] {
  return readTrimmedEnv(env, key)
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter((domain) => domain.length > 0);
}

/**
 * Google and GitHub let anyone create an identity, so just-in-time signup is
 * only meaningful when it is fenced by an email-domain allowlist.
 */
function resolvePublicIdpSignup(args: {
  id: SsoProvider;
  allowSignup: boolean;
  allowedEmailDomains: string[];
}): boolean {
  if (!args.allowSignup) return false;
  if (args.allowedEmailDomains.length > 0) return true;

  if (!warnedOpenSignupProviders.has(args.id)) {
    warnedOpenSignupProviders.add(args.id);
    logger.warn(
      "Ignoring SSO signup flag because no email domains are allowed",
      { provider: args.id },
    );
  }
  return false;
}

function readGoogleConfig(env: EnvSource): SsoProviderConfig | null {
  const clientId = readTrimmedEnv(env, "SSO_GOOGLE_CLIENT_ID");
  if (!clientId) return null;

  const allowedEmailDomains = parseEmailDomains(
    env,
    "SSO_GOOGLE_ALLOWED_EMAIL_DOMAINS",
  );

  return {
    id: "google",
    displayName: "Google",
    clientId,
    clientSecret: readTrimmedEnv(env, "SSO_GOOGLE_CLIENT_SECRET") || null,
    issuerUrl: GOOGLE_ISSUER_URL,
    scopes: GOOGLE_SCOPES,
    allowSignup: resolvePublicIdpSignup({
      id: "google",
      allowSignup: parseBooleanFlag(env, "SSO_GOOGLE_ALLOW_SIGNUP", false),
      allowedEmailDomains,
    }),
    allowedEmailDomains,
    allowInsecureHttp: false,
  };
}

function readGithubConfig(env: EnvSource): SsoProviderConfig | null {
  const clientId = readTrimmedEnv(env, "SSO_GITHUB_CLIENT_ID");
  if (!clientId) return null;

  const allowedEmailDomains = parseEmailDomains(
    env,
    "SSO_GITHUB_ALLOWED_EMAIL_DOMAINS",
  );

  return {
    id: "github",
    displayName: "GitHub",
    clientId,
    clientSecret: readTrimmedEnv(env, "SSO_GITHUB_CLIENT_SECRET") || null,
    issuerUrl: GITHUB_ISSUER_URL,
    scopes: GITHUB_SCOPES,
    allowSignup: resolvePublicIdpSignup({
      id: "github",
      allowSignup: parseBooleanFlag(env, "SSO_GITHUB_ALLOW_SIGNUP", false),
      allowedEmailDomains,
    }),
    allowedEmailDomains,
    allowInsecureHttp: false,
  };
}

function readOidcConfig(env: EnvSource): SsoProviderConfig | null {
  const clientId = readTrimmedEnv(env, "SSO_OIDC_CLIENT_ID");
  const issuerUrl = readTrimmedEnv(env, "SSO_OIDC_ISSUER_URL");
  if (!clientId || !issuerUrl) return null;

  return {
    id: "oidc",
    displayName:
      readTrimmedEnv(env, "SSO_OIDC_DISPLAY_NAME") || DEFAULT_OIDC_DISPLAY_NAME,
    clientId,
    clientSecret: readTrimmedEnv(env, "SSO_OIDC_CLIENT_SECRET") || null,
    issuerUrl,
    scopes: readTrimmedEnv(env, "SSO_OIDC_SCOPES") || DEFAULT_OIDC_SCOPES,
    allowSignup: parseBooleanFlag(env, "SSO_OIDC_ALLOW_SIGNUP", false),
    allowedEmailDomains: parseEmailDomains(
      env,
      "SSO_OIDC_ALLOWED_EMAIL_DOMAINS",
    ),
    allowInsecureHttp: parseBooleanFlag(
      env,
      "SSO_OIDC_ALLOW_INSECURE_HTTP",
      false,
    ),
  };
}

export function getSsoProviderConfigs(
  env: EnvSource = process.env,
): SsoProviderConfig[] {
  return [
    readGoogleConfig(env),
    readGithubConfig(env),
    readOidcConfig(env),
  ].filter((config): config is SsoProviderConfig => config !== null);
}

export function getSsoProviderConfig(
  id: SsoProvider,
  env: EnvSource = process.env,
): SsoProviderConfig | null {
  return getSsoProviderConfigs(env).find((config) => config.id === id) ?? null;
}

export function listEnabledSsoProviders(
  env: EnvSource = process.env,
): SsoProviderInfo[] {
  return getSsoProviderConfigs(env).map((config) => ({
    id: config.id,
    displayName: config.displayName,
  }));
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
  } catch {
    return null;
  }
  return trimmed.replace(/\/+$/, "");
}

/**
 * The redirect URI is registered at the IdP, so it has to match the instance's
 * public URL exactly. `trust proxy` is off in this app, which makes the derived
 * origin `http://` behind a TLS-terminating proxy — hence the env overrides.
 */
export function resolveSsoBaseUrl(req: Request): string | null {
  return (
    normalizeBaseUrl(process.env.SSO_REDIRECT_BASE_URL) ??
    normalizeBaseUrl(resolveRequestOrigin(req))
  );
}
