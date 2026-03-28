/**
 * Express app factory (useful for tests).
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
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
import { sanitizeUnknown } from "@infra/sanitize";
import cors from "cors";
import express from "express";
import { apiRouter } from "./api/index";
import { getDataDir } from "./config/dataDir";
import { isDemoMode } from "./config/demo";
import { resolveTracerRedirect } from "./services/tracer-links";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UMAMI_UPSTREAM_ORIGIN = "https://umami.dakheera47.com";
const UMAMI_PROXY_TIMEOUT_MS = 5_000;
const HOP_BY_HOP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const REQUEST_HEADERS_TO_SKIP = new Set([
  "authorization",
  "connection",
  "content-length",
  "cookie",
  "host",
  "transfer-encoding",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-port",
  "x-forwarded-proto",
  "x-forwarded-server",
]);
const ALLOWED_UMAMI_PROXY_PATHS = new Set(["/script.js", "/api/send"]);
const ALLOWED_UMAMI_PROXY_METHODS = new Map<string, string[]>([
  ["/script.js", ["GET", "HEAD"]],
  ["/api/send", ["POST"]],
]);

function isStatsRoute(path: string): boolean {
  return path === "/stats" || path.startsWith("/stats/");
}

function getUmamiUpstreamUrl(originalUrl: string): URL {
  const incomingUrl = new URL(originalUrl, "http://localhost");
  const upstreamUrl = new URL(UMAMI_UPSTREAM_ORIGIN);
  upstreamUrl.pathname = incomingUrl.pathname.replace(/^\/stats/, "") || "/";
  upstreamUrl.search = incomingUrl.search;
  return upstreamUrl;
}

function isAllowedUmamiProxyPath(pathname: string): boolean {
  return ALLOWED_UMAMI_PROXY_PATHS.has(pathname);
}

function getAllowedUmamiMethods(pathname: string): string[] {
  return ALLOWED_UMAMI_PROXY_METHODS.get(pathname) ?? [];
}

function isAllowedUmamiMethod(method: string, pathname: string): boolean {
  return getAllowedUmamiMethods(pathname).includes(method.toUpperCase());
}

function isUmamiProxyTimeoutError(error: unknown): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return true;
  }
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

function buildUmamiProxyBody(req: express.Request): BodyInit | undefined {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (Buffer.isBuffer(req.body)) return new Uint8Array(req.body);
  if (typeof req.body === "string") return req.body;
  if (req.body === undefined || req.body === null) return undefined;
  if (
    typeof req.body === "object" &&
    Object.keys(req.body as Record<string, unknown>).length === 0
  ) {
    return undefined;
  }
  return JSON.stringify(req.body);
}

function copyUmamiResponseHeaders(
  upstreamResponse: Response,
  res: express.Response,
): void {
  for (const [key, value] of upstreamResponse.headers.entries()) {
    if (HOP_BY_HOP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
    res.setHeader(key, value);
  }
}

function buildUmamiProxyHeaders(req: express.Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || REQUEST_HEADERS_TO_SKIP.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

export function createBasicAuthGuard() {
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

    // Explicitly allowed public API routes
    if (normalizedPath === "/api/profile/status") return true;
    if (
      normalizedMethod === "POST" &&
      normalizedPath === "/api/visa-sponsors/search"
    )
      return true;

    return false;
  }

  function requiresAuth(method: string, path: string): boolean {
    if (isPublicReadOnlyRoute(method, path)) return false;
    if (isStatsRoute(path)) return false;
    // OPTIONS is always exempt for CORS preflight.
    if (method.toUpperCase() === "OPTIONS") return false;

    // All /api/* paths require auth regardless of HTTP method.
    if (path.startsWith("/api/")) return true;

    // Non-API routes (SPA, /health, /pdfs, static) remain publicly readable.
    return !["GET", "HEAD"].includes(method.toUpperCase());
  }

  const middleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    const { enabled } = getAuthConfig();
    if (!enabled || !requiresAuth(req.method, req.path)) return next();
    if (isAuthorized(req)) return next();
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
  const corsMiddleware = cors();

  const handleTracerRedirect = async (
    req: express.Request,
    res: express.Response,
    slug: string,
    route: string,
  ) => {
    try {
      const redirect = await resolveTracerRedirect({
        token: slug,
        requestId:
          (res.getHeader("x-request-id") as string | undefined) ?? null,
        ip: req.ip ?? null,
        userAgent: req.header("user-agent") ?? null,
        referrer: req.header("referer") ?? null,
      });

      if (!redirect) {
        logger.warn("Tracer link not found", {
          route,
          token: slug,
        });
        res.status(404).type("text/plain; charset=utf-8").send("Not found");
        return;
      }

      logger.info("Tracer link redirected", {
        route,
        token: slug,
        jobId: redirect.jobId,
      });
      res.set("Cache-Control", "no-store");
      res.set("Pragma", "no-cache");
      res.set("Expires", "0");
      res.redirect(302, redirect.destinationUrl);
    } catch (error) {
      logger.error("Tracer redirect failed", {
        route,
        token: slug,
        error,
      });
      res.status(500).type("text/plain; charset=utf-8").send("Internal error");
    }
  };

  app.use((req, res, next) => {
    if (isStatsRoute(req.path)) {
      next();
      return;
    }
    corsMiddleware(req, res, next);
  });
  app.use(requestContextMiddleware());
  app.use("/stats", express.raw({ limit: "1mb", type: "*/*" }));
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

  app.get("/cv/:slug", async (req, res) => {
    const slug = req.params.slug?.trim();
    if (!slug) {
      res.status(404).type("text/plain; charset=utf-8").send("Not found");
      return;
    }
    await handleTracerRedirect(req, res, slug, "GET /cv/:slug");
  });

  app.all(/^\/stats(?:\/.*)?$/, async (req, res) => {
    const upstreamUrl = getUmamiUpstreamUrl(req.originalUrl);
    if (!isAllowedUmamiProxyPath(upstreamUrl.pathname)) {
      res.status(404).type("text/plain; charset=utf-8").send("Not found");
      return;
    }
    if (!isAllowedUmamiMethod(req.method, upstreamUrl.pathname)) {
      res
        .setHeader(
          "Allow",
          getAllowedUmamiMethods(upstreamUrl.pathname).join(", "),
        )
        .status(405)
        .type("text/plain; charset=utf-8")
        .send("Method not allowed");
      return;
    }

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: req.method,
        headers: buildUmamiProxyHeaders(req),
        body: buildUmamiProxyBody(req),
        redirect: "manual",
        signal: AbortSignal.timeout(UMAMI_PROXY_TIMEOUT_MS),
      });

      res.status(upstreamResponse.status);
      copyUmamiResponseHeaders(upstreamResponse, res);

      if (req.method === "HEAD") {
        res.end();
        return;
      }
      if (!upstreamResponse.body) {
        res.end();
        return;
      }

      await pipeline(
        Readable.fromWeb(upstreamResponse.body as NodeReadableStream),
        res,
      );
    } catch (error) {
      if (isUmamiProxyTimeoutError(error)) {
        logger.warn("Umami proxy timed out", {
          route: req.path,
          method: req.method,
          upstreamUrl: upstreamUrl.toString(),
          requestId:
            (res.getHeader("x-request-id") as string | undefined) ?? undefined,
        });
        res
          .status(504)
          .type("text/plain; charset=utf-8")
          .send("Upstream timeout");
        return;
      }

      logger.error("Umami proxy failed", {
        route: req.path,
        method: req.method,
        upstreamUrl: upstreamUrl.toString(),
        requestId:
          (res.getHeader("x-request-id") as string | undefined) ?? undefined,
        error: sanitizeUnknown(error),
      });
      res.status(502).type("text/plain; charset=utf-8").send("Upstream error");
    }
  });

  // Serve static files for generated PDFs
  const pdfDir = join(getDataDir(), "pdfs");
  if (isDemoMode()) {
    const demoPdfPath = join(pdfDir, "demo.pdf");
    app.get("/pdfs/*", (_req, res) => {
      res.sendFile(demoPdfPath, (error) => {
        if (error) res.status(404).end();
      });
    });
  }
  app.use("/pdfs", express.static(pdfDir));

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Serve client app in production
  if (process.env.NODE_ENV === "production") {
    const packagedDocsDir = join(__dirname, "../../dist/docs");
    const workspaceDocsDir = join(__dirname, "../../../docs-site/build");
    const docsDir = existsSync(packagedDocsDir)
      ? packagedDocsDir
      : workspaceDocsDir;
    const docsIndexPath = join(docsDir, "index.html");
    let cachedDocsIndexHtml: string | null = null;

    if (existsSync(docsIndexPath)) {
      app.use("/docs", express.static(docsDir));
      app.get("/docs/*", async (req, res, next) => {
        if (!req.accepts("html")) {
          next();
          return;
        }
        if (extname(req.path)) {
          next();
          return;
        }
        if (!cachedDocsIndexHtml) {
          cachedDocsIndexHtml = await readFile(docsIndexPath, "utf-8");
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.send(cachedDocsIndexHtml);
      });
    }

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
