import useDocusaurusContext from "@docusaurus/useDocusaurusContext";
import type { ReactNode } from "react";
import { useEffect } from "react";
import {
  type DocsUmamiSiteConfig,
  ensureDocsUmamiScript,
  getDocsDemoMode,
  installDocsUmamiClickTracking,
  isStandaloneDocsDev,
  resolveDocsUmamiConfig,
} from "../lib/umami";

type RootProps = {
  children: ReactNode;
};

type SiteConfigWithUmami = {
  customFields?: {
    umami?: DocsUmamiSiteConfig;
  };
};

export default function Root({ children }: RootProps) {
  const { siteConfig } = useDocusaurusContext();
  const umamiConfig = (siteConfig as SiteConfigWithUmami).customFields?.umami;

  useEffect(() => {
    if (!umamiConfig) return;

    const cleanupTracking = installDocsUmamiClickTracking({
      document,
      windowObject: window,
    });

    let cancelled = false;

    const boot = async () => {
      const defaultDemoMode = umamiConfig.docsBuildDemoMode === true;
      const standaloneDocsDev = isStandaloneDocsDev(
        window.location,
        umamiConfig.standaloneDevPort,
      );
      const demoMode = standaloneDocsDev
        ? defaultDemoMode
        : await getDocsDemoMode({
            defaultDemoMode,
            fetchImpl: window.fetch.bind(window),
            shouldQueryApi: !standaloneDocsDev,
          });

      if (cancelled) return;

      ensureDocsUmamiScript({
        config: resolveDocsUmamiConfig({
          demoMode,
          location: window.location,
          siteConfig: umamiConfig,
        }),
        document,
      });
    };

    void boot();

    return () => {
      cancelled = true;
      cleanupTracking();
    };
  }, [umamiConfig]);

  return <>{children}</>;
}
