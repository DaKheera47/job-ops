/**
 * Express app factory (useful for tests).
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve as pathResolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  apiErrorHandler,
  legacyApiResponseShim,
  notFoundApiHandler,
  requestContextMiddleware,
} from "@infra/http";
import { logger } from "@infra/logger";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { apiRouter } from "./api/index";
import { getDataDir } from "./config/dataDir";
import { isDemoMode } from "./config/demo";
import { apiLimiter } from "./middleware/rateLimiter";
import { resolveTracerRedirect } from "./services/tracer-links";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

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

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    }),
  );

  // CORS — locked to specific origin
  app.use(
    cors({
      origin: process.env.ALLOWED_ORIGIN || false,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Reauth-Token"],
    }),
  );

  app.use(requestContextMiddleware());
  app.use(express.json({ limit: "5mb" }));
  app.use(legacyApiResponseShim());

  // Cookie parser (for refresh token cookie)
  app.use(cookieParser());

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

  // Rate limiter for API
  app.use("/api", apiLimiter);

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
  // Serve static files for generated PDFs (with path traversal protection)
  app.get("/pdfs/:filename", (req, res) => {
    const filename = req.params.filename;
    if (!filename) {
      res.status(404).end();
      return;
    }
    const safeName = basename(filename);
    const resolved = pathResolve(pdfDir, safeName);
    if (!resolved.startsWith(pdfDir)) {
      res.status(403).end();
      return;
    }
    res.sendFile(resolved, (error) => {
      if (error) res.status(404).end();
    });
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
