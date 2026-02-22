import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

type SitemapItem = { url: string } & Record<string, unknown>;
type SitemapCreateParams = {
  defaultCreateSitemapItems: (params: unknown) => Promise<unknown>;
};

function isSitemapItem(value: unknown): value is SitemapItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const maybeItem = value as { url?: unknown };
  return typeof maybeItem.url === "string";
}

const productionSiteUrl = "https://jobops.dakheera47.com";
const siteUrl =
  process.env.DOCS_SITE_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3006"
    : productionSiteUrl);
const configuredBaseUrl = process.env.DOCS_BASE_URL ?? "/docs/";
const normalizedBaseUrl = configuredBaseUrl.startsWith("/")
  ? configuredBaseUrl
  : `/${configuredBaseUrl}`;
const siteBaseUrl = normalizedBaseUrl.endsWith("/")
  ? normalizedBaseUrl
  : `${normalizedBaseUrl}/`;

const config: Config = {
  title: "JobOps Documentation",
  tagline: "Self-hosted job search automation docs",
  favicon: "img/favicon.png",
  future: {
    v4: true,
  },
  url: siteUrl,
  baseUrl: siteBaseUrl,
  onBrokenLinks: "throw",
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: "throw",
    },
  },
  i18n: {
    defaultLocale: "en",
    locales: ["en"],
  },
  presets: [
    [
      "classic",
      {
        docs: {
          routeBasePath: "/",
          sidebarPath: "./sidebars.ts",
          editUrl: "https://github.com/DaKheera47/job-ops/tree/main/docs-site/",
          showLastUpdateAuthor: false,
          showLastUpdateTime: true,
        },
        sitemap: {
          // Keep search engines focused on the current stable docs URLs.
          async createSitemapItems(params: SitemapCreateParams) {
            const rawItems = await params.defaultCreateSitemapItems(params);
            if (!Array.isArray(rawItems)) {
              return [];
            }

            return rawItems.filter(isSitemapItem).filter((item) => {
              const pathname = new URL(item.url).pathname;
              const isNextDocsRoute = pathname.startsWith("/docs/next/");
              const isVersionedDocsRoute =
                /^\/docs\/\d+\.\d+\.\d+(?:\/|$)/.test(pathname);

              return !isNextDocsRoute && !isVersionedDocsRoute;
            });
          },
        },
        blog: false,
        pages: false,
        theme: {
          customCss: "./src/css/custom.css",
        },
      } satisfies Preset.Options,
    ],
  ],
  themeConfig: {
    navbar: {
      title: "JobOps Docs",
      logo: {
        alt: "JobOps",
        src: "img/favicon.png",
      },
      items: [
        {
          type: "docSidebar",
          sidebarId: "docsSidebar",
          position: "left",
          label: "Documentation",
        },
        {
          to: "/",
          label: "Latest",
          position: "left",
        },
        {
          type: "docsVersionDropdown",
          position: "right",
          dropdownActiveClassDisabled: true,
        },
        {
          type: "html",
          value:
            '<a class="navbar__item navbar__link" href="/overview">Back to App</a>',
          position: "right",
        },
        {
          href: "https://github.com/DaKheera47/job-ops",
          label: "GitHub",
          position: "right",
        },
      ],
    },
    footer: {
      style: "dark",
      links: [
        {
          title: "Docs",
          items: [
            {
              label: "Introduction",
              to: "/",
            },
            {
              label: "Self-Hosting",
              to: "/getting-started/self-hosting",
            },
          ],
        },
        {
          title: "Project",
          items: [
            {
              label: "Repository",
              href: "https://github.com/DaKheera47/job-ops",
            },
            {
              label: "Issues",
              href: "https://github.com/DaKheera47/job-ops/issues",
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} JobOps`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
