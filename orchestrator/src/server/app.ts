/**
 * Express app factory (useful for tests).
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unauthorized } from "@infra/errors";
import {
  apiErrorHandler,
  fail,
  legacyApiResponseShim,
  notFoundApiHandler,
  requestContextMiddleware,
} from "@infra/http";
import { logger } from "@infra/logger";
import cors from "cors";
import express from "express";
import { apiRouter } from "./api/index";
import { getDataDir } from "./config/dataDir";

const __dirname = dirname(fileURLToPath(import.meta.url));

function createBasicAuthGuard() {
  function getAuthConfig() {
    const user = process.env.BASIC_AUTH_USER || "";
    const pass = process.env.BASIC_AUTH_PASSWORD || "";
    return {
      user,
      pass,
      enabled: user.length > 0 && pass.length > 0,
    };
  }

  function isAuthorized(req: express.Request): boolean {
    const { user: authUser, pass: authPass, enabled } = getAuthConfig();
    if (!enabled) return false;
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Basic ")) return false;
    const encoded = authHeader.slice("Basic ".length).trim();
    let decoded = "";
    try {
      decoded = Buffer.from(encoded, "base64").toString("utf-8");
    } catch {
      return false;
    }
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return false;
    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);
    return user === authUser && pass === authPass;
  }

  function isPublicReadOnlyRoute(method: string, path: string): boolean {
    const normalizedMethod = method.toUpperCase();
    const normalizedPath = path.split("?")[0] || path;
    if (
      normalizedMethod === "POST" &&
      normalizedPath === "/api/visa-sponsors/search"
    )
      return true;
    return false;
  }

  function requiresAuth(method: string, path: string): boolean {
    if (isPublicReadOnlyRoute(method, path)) return false;
    return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
  }

  const middleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const { enabled } = getAuthConfig();
    if (!enabled || !requiresAuth(req.method, req.path)) return next();
    if (isAuthorized(req)) return next();
    res.setHeader("WWW-Authenticate", 'Basic realm="Job Ops"');
    fail(res, unauthorized("Authentication required"));
  };

  return {
    middleware,
    isAuthorized,
    basicAuthEnabled: getAuthConfig().enabled,
  };
}

export function createApp() {
  const app = express();
  const authGuard = createBasicAuthGuard();

  app.use(cors());
  app.use(requestContextMiddleware());
  app.use(express.json({ limit: "5mb" }));
  app.use(legacyApiResponseShim());

  // Logging middleware
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      logger.info("HTTP request completed", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: duration,
      });
    });
    next();
  });

  // Optional Basic Auth for write access (read-only by default)
  app.use(authGuard.middleware);

  // API routes
  app.use("/api", apiRouter);
  app.use(notFoundApiHandler());

  // Serve static files for generated PDFs
  const pdfDir = join(getDataDir(), "pdfs");
  app.use("/pdfs", express.static(pdfDir));

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Serve client app in production
  if (process.env.NODE_ENV === "production") {
    const clientDir = join(__dirname, "../../dist/client");
    app.use(express.static(clientDir));

    // SPA fallback
    const indexPath = join(clientDir, "index.html");
    let cachedIndexHtml: string | null = null;
    app.get("*", async (req, res) => {
      if (!req.accepts("html")) {
        res.status(404).end();
        return;
      }
      if (!cachedIndexHtml) {
        cachedIndexHtml = await readFile(indexPath, "utf-8");
      }
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(cachedIndexHtml);
    });
  }

  app.use(apiErrorHandler);

  return app;
}
