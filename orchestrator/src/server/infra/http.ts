import crypto from "node:crypto";
import type { ApiResponse } from "@shared/types";
import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import type { AppError } from "./errors";
import { notFound, statusToCode, toAppError } from "./errors";
import { logger } from "./logger";
import { getRequestId, runWithRequestContext } from "./request-context";
import { sanitizeUnknown } from "./sanitize";

function getResponseRequestId(res: Response): string {
  return (
    (res.getHeader("x-request-id") as string | undefined) ??
    getRequestId() ??
    "unknown"
  );
}

export function ok<T>(res: Response, data: T, status = 200): void {
  const payload: ApiResponse<T> = {
    ok: true,
    data,
    meta: { requestId: getResponseRequestId(res) },
  };
  res.status(status).json(payload);
}

export function fail(res: Response, error: AppError): void {
  const payload: ApiResponse<never> = {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined
        ? { details: sanitizeUnknown(error.details) }
        : {}),
    },
    meta: { requestId: getResponseRequestId(res) },
  };
  res.status(error.status).json(payload);
}

export function asyncRoute(
  handler: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function requestContextMiddleware(): RequestHandler {
  return (req, res, next) => {
    const requestIdHeader = req.header("x-request-id")?.trim();
    const requestId =
      requestIdHeader && requestIdHeader.length > 0
        ? requestIdHeader
        : crypto.randomUUID();

    res.setHeader("x-request-id", requestId);
    runWithRequestContext({ requestId }, () => next());
  };
}

export function legacyApiResponseShim(): RequestHandler {
  return (req, res, next) => {
    if (!req.path.startsWith("/api")) return next();

    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (!body || typeof body !== "object") return originalJson(body);
      const payload = body as Record<string, unknown>;
      if ("ok" in payload) {
        if (!("meta" in payload)) {
          return originalJson({
            ...payload,
            meta: { requestId: getResponseRequestId(res) },
          });
        }
        return originalJson(body);
      }

      if (typeof payload.success === "boolean") {
        const requestId = getResponseRequestId(res);
        if (payload.success) {
          let data: unknown = payload.data;
          if (data === undefined && payload.message !== undefined) {
            data = { message: payload.message };
          }
          return originalJson({
            ok: true,
            data: data ?? null,
            meta: { requestId },
          } satisfies ApiResponse<unknown>);
        }

        const status = res.statusCode >= 400 ? res.statusCode : 500;
        const rawError = payload.error;
        const message =
          typeof rawError === "string"
            ? rawError
            : typeof payload.message === "string"
              ? payload.message
              : "Request failed";
        const details =
          rawError && typeof rawError === "object"
            ? (rawError as { details?: unknown }).details
            : payload.details;

        return originalJson({
          ok: false,
          error: {
            code: statusToCode(status),
            message,
            ...(details !== undefined
              ? { details: sanitizeUnknown(details) }
              : {}),
          },
          meta: { requestId },
        } satisfies ApiResponse<never>);
      }

      return originalJson(body);
    }) as Response["json"];

    next();
  };
}

export function notFoundApiHandler(): RequestHandler {
  return (req, _res, next) => {
    if (!req.path.startsWith("/api")) return next();
    next(notFound(`Route not found: ${req.method} ${req.path}`));
  };
}

export const apiErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const appError = toAppError(err);
  logger.error(appError.message, {
    status: appError.status,
    code: appError.code,
    details: appError.details,
    cause: appError.cause,
  });
  fail(res, appError);
};
