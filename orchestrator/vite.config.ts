/// <reference types="vitest" />

import { execSync } from "node:child_process";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

let gitVersion: string;
try {
  gitVersion = execSync("git describe --tags --always", {
    stdio: ["ignore", "pipe", "ignore"],
  })
    .toString()
    .trim();
} catch {
  gitVersion = process.env.APP_VERSION ?? "unknown";
}

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
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "../shared/src/**/*.test.ts",
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
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  define: {
    __APP_VERSION__: JSON.stringify(gitVersion),
  },
});
