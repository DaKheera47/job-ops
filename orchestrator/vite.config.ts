/// <reference types="vitest" />

import { readFileSync } from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function readAppVersion(): string {
  const packageJsonPath = new URL("./package.json", import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    version?: unknown;
  };

  if (
    typeof packageJson.version !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(packageJson.version)
  ) {
    throw new Error(
      "orchestrator/package.json must contain a semver version in x.y.z format",
    );
  }

  return `v${packageJson.version}`;
}

const appVersion = readAppVersion();
const ANALYTICS_DISABLED_TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

function isEnvFlagEnabled(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized ? ANALYTICS_DISABLED_TRUTHY_VALUES.has(normalized) : false;
}

const analyticsDisabled =
  isEnvFlagEnabled(process.env.JOBOPS_DISABLE_ANALYTICS) ||
  isEnvFlagEnabled(process.env.VITE_JOBOPS_DISABLE_ANALYTICS);
const ANALYTICS_HTML_BLOCK_PATTERN =
  /\s*<!-- jobops-analytics:start -->[\s\S]*?<!-- jobops-analytics:end -->/;

function analyticsHtmlGatePlugin() {
  return {
    name: "jobops-analytics-html-gate",
    transformIndexHtml(html: string) {
      if (!analyticsDisabled) return html;
      const withoutAnalytics = html.replace(ANALYTICS_HTML_BLOCK_PATTERN, "");
      return withoutAnalytics.replace(
        "</head>",
        "    <script>window.__JOBOPS_ANALYTICS_DISABLED__=true;</script>\n  </head>",
      );
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __APP_VERSION__: string;
  // eslint-disable-next-line no-var
  var __JOBOPS_ANALYTICS_DISABLED__: boolean;
}

export default defineConfig({
  plugins: [analyticsHtmlGatePlugin(), react(), tailwindcss()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    pool: "forks",
    maxWorkers: 4,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "../docs-site/src/**/*.test.ts",
      "../docs-site/src/**/*.test.tsx",
      "../career-boards/**/*.test.ts",
      "../shared/src/**/*.test.ts",
      "../extractors/**/tests/**/*.test.ts",
    ],
    exclude: ["node_modules/**", "dist/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@client": path.resolve(__dirname, "./src/client"),
      "@server": path.resolve(__dirname, "./src/server"),
      "@infra": path.resolve(__dirname, "./src/server/infra"),
      "@shared": path.resolve(__dirname, "../shared/src"),
      "job-ops-shared": path.resolve(__dirname, "../shared/src"),
      "@career-boards/bamboohr": path.resolve(
        __dirname,
        "../career-boards/bamboohr/src/index.ts",
      ),
      "@career-boards/workday": path.resolve(
        __dirname,
        "../career-boards/workday/src/index.ts",
      ),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/pdfs": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/stats": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
    __JOBOPS_ANALYTICS_DISABLED__: JSON.stringify(analyticsDisabled),
  },
});
