import type * as Preset from "@docusaurus/preset-classic";
import type { Config } from "@docusaurus/types";
import { themes as prismThemes } from "prism-react-renderer";

const config: Config = {
  title: "JobOps Documentation",
  tagline: "Self-hosted job search automation docs",
  favicon: "img/favicon.ico",
  future: {
    v4: true,
  },
  url: "http://localhost:3005",
  baseUrl: "/docs/",
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
        src: "img/logo.svg",
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
