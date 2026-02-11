import type { PostApplicationProvider } from "@shared/types";
import { POST_APPLICATION_PROVIDERS } from "@shared/types";
import { providerInvalidRequest } from "./errors";
import { gmailProvider } from "./gmail";
import { imapProvider } from "./imap";
import type { PostApplicationProviderAdapter } from "./types";

const providerRegistry: Record<
  PostApplicationProvider,
  PostApplicationProviderAdapter
> = {
  gmail: gmailProvider,
  imap: imapProvider,
};

function isPostApplicationProvider(
  value: string,
): value is PostApplicationProvider {
  return (POST_APPLICATION_PROVIDERS as readonly string[]).includes(value);
}

export function resolvePostApplicationProvider(
  provider: string,
): PostApplicationProviderAdapter {
  if (!isPostApplicationProvider(provider)) {
    throw providerInvalidRequest(`Unsupported provider '${provider}'.`, {
      provider,
      supportedProviders: POST_APPLICATION_PROVIDERS,
    });
  }

  return providerRegistry[provider];
}

export function listPostApplicationProviders(): PostApplicationProvider[] {
  return [...POST_APPLICATION_PROVIDERS];
}
