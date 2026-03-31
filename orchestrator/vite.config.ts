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

declare global {
  // eslint-disable-next-line no-var
  var __APP_VERSION__: string;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    pool: "forks",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "../docs-site/src/**/*.test.ts",
      "../docs-site/src/**/*.test.tsx",
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
  },
});
