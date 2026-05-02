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
  notFoundApiHandler,
  requestContextMiddleware,
} from "@infra/http";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { sanitizeUnknown } from "@infra/sanitize";
import { verifyToken } from "@server/auth/jwt";
import * as usersRepo from "@server/repositories/users";
import { proxyChallengeViewerRequest } from "@server/services/challenge-viewer";
import { DEFAULT_TENANT_ID } from "@server/tenancy/constants";
import cors from "cors";
import express from "express";
import { apiRouter } from "./api/index";
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

export function createAuthGuard() {
  const testAuthBypassEnabled =
    process.env.NODE_ENV === "test" &&
    process.env.JOBOPS_TEST_AUTH_BYPASS === "1";

  async function getAuthorizationContext(req: express.Request): Promise<{
    userId: string;
    tenantId: string;
    username: string;
    isSystemAdmin: boolean;
  } | null> {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return null;
    const token = authHeader.slice("Bearer ".length).trim();
    try {
      const payload = await verifyToken(token);
      const user = await usersRepo.getUserById(payload.userId);
      if (!user || user.isDisabled || user.workspaceId !== payload.tenantId) {
        return null;
      }
      return {
        userId: user.id,
        tenantId: user.workspaceId,
        username: user.username,
        isSystemAdmin: user.isSystemAdmin,
      };
    } catch {
      return null;
    }
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
    if (
      normalizedMethod === "POST" &&
      normalizedPath === "/api/webhook/trigger"
    )
      return Boolean(process.env.WEBHOOK_SECRET?.trim());

    // Auth endpoints must be accessible without existing auth.
    if (
      normalizedMethod === "POST" &&
      (normalizedPath === "/api/auth/login" ||
        normalizedPath === "/api/auth/logout" ||
        normalizedPath === "/api/auth/setup")
    )
      return true;
    if (
      normalizedMethod === "GET" &&
      normalizedPath === "/api/auth/bootstrap-status"
    )
      return true;
    if (
      ["GET", "HEAD"].includes(normalizedMethod) &&
      /^\/api\/design-resume\/assets\/[^/]+\/content$/.test(normalizedPath)
    )
      return true;

    return false;
  }

  function requiresAuth(method: string, path: string): boolean {
    if (isPublicReadOnlyRoute(method, path)) return false;
    // OPTIONS is always exempt for CORS preflight.
    if (method.toUpperCase() === "OPTIONS") return false;

    // Umami's public script posts browser beacons to /stats/api/send. The
    // proxy route still validates method/path before forwarding.
    if (isStatsRoute(path)) return false;

    // Analytics and per-job tracer details are workspace-private.
    if (path.startsWith("/api/tracer-links/analytics")) return true;
    if (path.startsWith("/api/tracer-links/jobs")) return true;

    // Allow public read access to other tracer link routes.
    if (path.startsWith("/api/tracer-links")) {
      return !["GET", "HEAD"].includes(method.toUpperCase());
    }

    // All other /api/* paths require auth regardless of HTTP method.
    if (path.startsWith("/api/")) return true;

    // Non-API routes (SPA, /health, static) remain publicly readable via GET/HEAD.
    return !["GET", "HEAD"].includes(method.toUpperCase());
  }

  const middleware = (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    void (async () => {
      if (!requiresAuth(req.method, req.path)) {
        next();
        return;
      }

      if (testAuthBypassEnabled) {
        runWithRequestContext(
          {
            userId: "test-user",
            tenantId: DEFAULT_TENANT_ID,
            username: "test",
            isSystemAdmin: true,
          },
          () => next(),
        );
        return;
      }

      const userCount = await usersRepo.countUsers();
      if (userCount === 0) {
        fail(res, unauthorized("Initial setup is required"));
        return;
      }

      const authContext = await getAuthorizationContext(req);
      if (authContext) {
        runWithRequestContext(authContext, () => next());
        return;
      }
      fail(res, unauthorized("Authentication required"));
    })().catch(next);
  };

  return {
    middleware,
    getAuthorizationContext,
  };
}

export function createApp() {
  const app = express();
  const authGuard = createAuthGuard();
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
  app.use(
    "/api/design-resume/assets",
    express.raw({
      limit: "10mb",
      type: [
        "image/png",
        "image/jpeg",
        "image/webp",
        "application/octet-stream",
      ],
    }),
  );
  // Resume file import sends base64 JSON payloads, which expand beyond the raw
  // file size. Scope the larger JSON limit to that endpoint only.
  app.use("/api/design-resume/import/file", express.json({ limit: "15mb" }));
  app.use(express.json());

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

  // Optional authentication for protected routes
  app.use(authGuard.middleware);

  // API routes
  app.use("/api", apiRouter);
  app.use(notFoundApiHandler());

  app.use("/challenge-viewer/session", (req, res) => {
    void proxyChallengeViewerRequest(req, res);
  });

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
