import type { SsoProvider } from "@shared/types";
import { Chrome, Github, KeyRound, type LucideIcon } from "lucide-react";

/**
 * lucide-react is the only icon source the app is allowed to use — icon fonts
 * and remote icon packs would phone home from the sign-in page — so these are
 * its closest marks rather than official brand logos.
 */
export const SSO_PROVIDER_ICONS: Record<SsoProvider, LucideIcon> = {
  google: Chrome,
  github: Github,
  oidc: KeyRound,
};
