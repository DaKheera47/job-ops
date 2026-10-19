export const SSO_PROVIDERS = ["google", "github", "oidc"] as const;

export type SsoProvider = (typeof SSO_PROVIDERS)[number];

export interface SsoProviderInfo {
  id: SsoProvider;
  displayName: string;
}

export interface SsoIdentitySummary {
  id: string;
  provider: SsoProvider;
  email: string | null;
  displayName: string | null;
  createdAt: string;
}

export interface SsoStartResponse {
  provider: SsoProvider;
  authorizationUrl: string;
  state: string;
  flowToken: string;
}
