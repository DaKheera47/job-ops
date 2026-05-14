import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@shared\/(.*)\.js$/,
        replacement: `${resolve(__dirname, "../../shared/src")}/$1.ts`,
      },
      {
        find: /^@shared\/(.*)$/,
        replacement: `${resolve(__dirname, "../../shared/src")}/$1`,
      },
    ],
  },
});
