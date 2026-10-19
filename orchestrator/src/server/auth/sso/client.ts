import { notFound, serviceUnavailable, upstreamError } from "@infra/errors";
import type { SsoProvider } from "@shared/types";
import * as client from "openid-client";
import { getSsoProviderConfig, type SsoProviderConfig } from "./config";

export type SsoIdentityClaims = {
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  preferredUsername: string | null;
};

const GITHUB_ISSUER = "https://github.com";
const GITHUB_API_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "job-ops",
};

const configurationCache = new Map<SsoProvider, client.Configuration>();

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asTrimmedString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function requireProviderConfig(provider: SsoProvider): SsoProviderConfig {
  const config = getSsoProviderConfig(provider);
  if (!config) {
    throw notFound(`SSO provider ${provider} is not enabled`);
  }
  return config;
}

async function discoverConfiguration(
  config: SsoProviderConfig,
): Promise<client.Configuration> {
  try {
    return await client.discovery(
      new URL(config.issuerUrl),
      config.clientId,
      undefined,
      config.clientSecret
        ? client.ClientSecretPost(config.clientSecret)
        : client.None(),
      config.allowInsecureHttp
        ? { execute: [client.allowInsecureRequests] }
        : undefined,
    );
  } catch (error) {
    throw serviceUnavailable(
      `SSO provider ${config.displayName} discovery failed: ${toErrorMessage(error)}`,
    );
  }
}

/**
 * GitHub is plain OAuth 2.0 with no discovery document and no ID token, and it
 * answers the token endpoint with a form-encoded body unless asked for JSON.
 */
function buildGithubConfiguration(
  config: SsoProviderConfig,
): client.Configuration {
  const configuration = new client.Configuration(
    {
      issuer: GITHUB_ISSUER,
      authorization_endpoint: "https://github.com/login/oauth/authorize",
      token_endpoint: "https://github.com/login/oauth/access_token",
    },
    config.clientId,
    config.clientSecret ?? undefined,
    config.clientSecret
      ? client.ClientSecretPost(config.clientSecret)
      : client.None(),
  );

  configuration[client.customFetch] = (url, options) =>
    fetch(url, {
      ...options,
      body: options.body as BodyInit | null | undefined,
      headers: {
        ...Object.fromEntries(new Headers(options.headers)),
        Accept: "application/json",
        "User-Agent": "job-ops",
      },
    });

  return configuration;
}

async function resolveConfiguration(
  config: SsoProviderConfig,
): Promise<client.Configuration> {
  const cached = configurationCache.get(config.id);
  if (cached) return cached;

  const configuration =
    config.id === "github"
      ? buildGithubConfiguration(config)
      : await discoverConfiguration(config);
  configurationCache.set(config.id, configuration);
  return configuration;
}

export async function createSsoAuthorizationRequest(input: {
  provider: SsoProvider;
  redirectUri: string;
}): Promise<{
  authorizationUrl: string;
  state: string;
  codeVerifier: string;
  nonce: string | null;
}> {
  const config = requireProviderConfig(input.provider);
  const configuration = await resolveConfiguration(config);

  const state = client.randomState();
  const codeVerifier = client.randomPKCECodeVerifier();
  // Expecting a nonce makes openid-client require an ID token, which GitHub
  // never issues.
  const nonce = input.provider === "github" ? null : client.randomNonce();

  let authorizationUrl: URL;
  try {
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    authorizationUrl = client.buildAuthorizationUrl(configuration, {
      redirect_uri: input.redirectUri,
      scope: config.scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      ...(nonce ? { nonce } : {}),
    });
  } catch (error) {
    // Discovery only checks that the document parses, so a metadata set without
    // an authorization endpoint (or an http:// one without the insecure opt-in)
    // fails here rather than above.
    throw serviceUnavailable(
      `SSO provider ${config.displayName} is misconfigured: ${toErrorMessage(error)}`,
    );
  }

  return {
    authorizationUrl: authorizationUrl.href,
    state,
    codeVerifier,
    nonce,
  };
}

export async function exchangeSsoAuthorizationCode(input: {
  provider: SsoProvider;
  redirectUri: string;
  callbackSearch: string;
  expectedState: string;
  codeVerifier: string;
  nonce: string | null;
}): Promise<SsoIdentityClaims> {
  const config = requireProviderConfig(input.provider);
  const configuration = await resolveConfiguration(config);

  let tokens: client.TokenEndpointResponse &
    client.TokenEndpointResponseHelpers;
  try {
    // The full callback query string is replayed so that RFC 9207 `iss` and any
    // other issuer-supplied parameters survive validation.
    tokens = await client.authorizationCodeGrant(
      configuration,
      new URL(`${input.redirectUri}${input.callbackSearch}`),
      {
        pkceCodeVerifier: input.codeVerifier,
        expectedState: input.expectedState,
        ...(input.nonce ? { expectedNonce: input.nonce } : {}),
      },
    );
  } catch (error) {
    throw upstreamError(
      `SSO provider ${config.displayName} rejected the sign-in: ${toErrorMessage(error)}`,
    );
  }

  return input.provider === "github"
    ? readGithubClaims(tokens.access_token)
    : readOidcClaims({ configuration, config, tokens });
}

async function readOidcClaims(args: {
  configuration: client.Configuration;
  config: SsoProviderConfig;
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers;
}): Promise<SsoIdentityClaims> {
  const claims = args.tokens.claims();
  if (!claims) {
    throw upstreamError(
      `SSO provider ${args.config.displayName} did not return an ID token`,
    );
  }

  let email = asTrimmedString(claims.email);
  let emailVerified = claims.email_verified === true;
  let displayName = asTrimmedString(claims.name);
  let preferredUsername = asTrimmedString(claims.preferred_username);

  if (!email && args.config.scopes.includes("email")) {
    let userInfo: Awaited<ReturnType<typeof client.fetchUserInfo>>;
    try {
      userInfo = await client.fetchUserInfo(
        args.configuration,
        args.tokens.access_token,
        claims.sub,
      );
    } catch (error) {
      throw upstreamError(
        `SSO provider ${args.config.displayName} userinfo request failed: ${toErrorMessage(error)}`,
      );
    }

    email = asTrimmedString(userInfo.email);
    emailVerified = userInfo.email_verified === true;
    displayName = displayName ?? asTrimmedString(userInfo.name);
    preferredUsername =
      preferredUsername ?? asTrimmedString(userInfo.preferred_username);
  }

  return {
    issuer: args.configuration.serverMetadata().issuer,
    subject: claims.sub,
    email: email ?? null,
    emailVerified,
    displayName: displayName ?? null,
    preferredUsername: preferredUsername ?? null,
  };
}

async function fetchGithubJson<T>(
  url: string,
  accessToken: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        ...GITHUB_API_HEADERS,
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (error) {
    throw upstreamError(`GitHub request failed: ${toErrorMessage(error)}`);
  }

  if (!response.ok) {
    throw upstreamError(`GitHub request failed with HTTP ${response.status}`);
  }

  return (await response.json()) as T;
}

type GithubEmail = {
  email?: string;
  primary?: boolean;
  verified?: boolean;
};

async function readGithubClaims(
  accessToken: string,
): Promise<SsoIdentityClaims> {
  const user = await fetchGithubJson<{
    id?: number;
    login?: string;
    name?: string | null;
  }>("https://api.github.com/user", accessToken);

  // The numeric id is the only immutable handle — a login can be renamed and
  // then claimed by someone else.
  if (typeof user.id !== "number") {
    throw upstreamError("GitHub did not return an account id");
  }

  const emails = await fetchGithubJson<GithubEmail[]>(
    "https://api.github.com/user/emails",
    accessToken,
  );
  const chosen =
    emails.find((entry) => entry.primary && entry.verified) ??
    emails.find((entry) => entry.verified) ??
    null;

  return {
    issuer: GITHUB_ISSUER,
    subject: String(user.id),
    email: asTrimmedString(chosen?.email) ?? null,
    emailVerified: chosen?.verified === true,
    displayName: asTrimmedString(user.name) ?? null,
    preferredUsername: asTrimmedString(user.login) ?? null,
  };
}
