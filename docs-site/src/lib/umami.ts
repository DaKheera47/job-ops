export const DEFAULT_DOCS_UMAMI_WEBSITE_ID =
  "a3d08b50-443f-4d21-8ebb-9355ba67578b";
export const DEMO_DOCS_UMAMI_WEBSITE_ID =
  "7956a54d-63f5-4528-af0f-f823dd421752";
export const UMAMI_PROXY_BASE_PATH = "/stats";
export const UMAMI_UPSTREAM_ORIGIN = "https://umami.dakheera47.com";
export const DOCS_STANDALONE_DEV_PORT = "3006";
const JOBOPS_UMAMI_SCRIPT_SELECTOR = 'script[data-jobops-umami="docs"]';

export type DocsUmamiRuntimeConfig = {
  demoMode: boolean;
  scriptSrc: string;
  hostUrl: string;
  websiteId: string;
};

export type DocsUmamiSiteConfig = {
  defaultWebsiteId?: string;
  demoWebsiteId?: string;
  docsBuildDemoMode?: boolean;
  proxyBasePath?: string;
  standaloneDevPort?: string;
  upstreamOrigin?: string;
};

type LocationLike = Pick<Location, "hostname" | "port">;

type DocumentLike = Pick<Document, "createElement" | "head" | "querySelector">;

type WindowLike = Window & {
  umami?: {
    track: (eventName: string, payload?: Record<string, unknown>) => void;
  };
};

export function isStandaloneDocsDev(
  location: LocationLike,
  standaloneDevPort = DOCS_STANDALONE_DEV_PORT,
): boolean {
  return (
    location.hostname === "localhost" && location.port === standaloneDevPort
  );
}

export function resolveDocsUmamiConfig(args: {
  demoMode: boolean;
  location: LocationLike;
  siteConfig?: DocsUmamiSiteConfig;
}): DocsUmamiRuntimeConfig {
  const siteConfig = args.siteConfig ?? {};
  const standaloneDevPort =
    siteConfig.standaloneDevPort ?? DOCS_STANDALONE_DEV_PORT;
  const proxyBasePath = siteConfig.proxyBasePath ?? UMAMI_PROXY_BASE_PATH;
  const upstreamOrigin = siteConfig.upstreamOrigin ?? UMAMI_UPSTREAM_ORIGIN;
  const useDirectScript = isStandaloneDocsDev(args.location, standaloneDevPort);

  return {
    demoMode: args.demoMode,
    scriptSrc: useDirectScript
      ? `${upstreamOrigin}/script.js`
      : `${proxyBasePath}/script.js`,
    hostUrl: useDirectScript ? upstreamOrigin : proxyBasePath,
    websiteId: args.demoMode
      ? (siteConfig.demoWebsiteId ?? DEMO_DOCS_UMAMI_WEBSITE_ID)
      : (siteConfig.defaultWebsiteId ?? DEFAULT_DOCS_UMAMI_WEBSITE_ID),
  };
}

export async function getDocsDemoMode(args: {
  defaultDemoMode: boolean;
  fetchImpl: typeof fetch;
  shouldQueryApi: boolean;
}): Promise<boolean> {
  if (!args.shouldQueryApi) {
    return args.defaultDemoMode;
  }

  try {
    const response = await args.fetchImpl("/api/demo/info", {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) return args.defaultDemoMode;
    const body = (await response.json()) as {
      ok?: boolean;
      data?: { demoMode?: boolean };
    };
    if (body.ok !== true) return args.defaultDemoMode;
    return body.data?.demoMode === true;
  } catch {
    return args.defaultDemoMode;
  }
}

export function ensureDocsUmamiScript(args: {
  config: DocsUmamiRuntimeConfig;
  document: DocumentLike;
}): void {
  if (args.document.querySelector(JOBOPS_UMAMI_SCRIPT_SELECTOR)) return;

  const script = args.document.createElement("script");
  script.defer = true;
  script.src = args.config.scriptSrc;
  script.setAttribute("data-website-id", args.config.websiteId);
  script.setAttribute("data-host-url", args.config.hostUrl);
  script.setAttribute("data-jobops-umami", "docs");
  args.document.head.appendChild(script);
}

export function trackDocsUmamiEvent(
  windowObject: WindowLike,
  eventName: string,
  payload?: Record<string, unknown>,
): void {
  windowObject.umami?.track(eventName, payload);
}

export function installDocsUmamiClickTracking(args: {
  document: Document;
  windowObject: WindowLike;
}): () => void {
  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const trackedElement = target.closest<HTMLElement>("[data-umami-event]");
    const eventName = trackedElement?.dataset.umamiEvent;
    if (!eventName) return;
    trackDocsUmamiEvent(args.windowObject, eventName);
  };

  args.document.addEventListener("click", handleClick);
  return () => {
    args.document.removeEventListener("click", handleClick);
  };
}
