import { ZodError } from "zod";

export type AppErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "REQUEST_TIMEOUT"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "UPSTREAM_ERROR"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL_ERROR";

const DEFAULT_CODE_BY_STATUS: Record<number, AppErrorCode> = {
  400: "INVALID_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  408: "REQUEST_TIMEOUT",
  409: "CONFLICT",
  422: "UNPROCESSABLE_ENTITY",
  500: "INTERNAL_ERROR",
  502: "UPSTREAM_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

export class AppError extends Error {
  status: number;
  code: AppErrorCode;
  details?: unknown;

  constructor(args: {
    message: string;
    status?: number;
    code?: AppErrorCode;
    details?: unknown;
    cause?: unknown;
  }) {
    super(args.message, { cause: args.cause });
    this.name = "AppError";
    this.status = args.status ?? 500;
    this.code = args.code ?? statusToCode(this.status);
    this.details = args.details;
  }
}

export function statusToCode(status: number): AppErrorCode {
  return DEFAULT_CODE_BY_STATUS[status] ?? "INTERNAL_ERROR";
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError({
    status: 400,
    code: "INVALID_REQUEST",
    message,
    details,
  });
}

export function unauthorized(message = "Unauthorized"): AppError {
  return new AppError({ status: 401, code: "UNAUTHORIZED", message });
}

export function forbidden(message = "Forbidden"): AppError {
  return new AppError({ status: 403, code: "FORBIDDEN", message });
}

export function notFound(message = "Not found"): AppError {
  return new AppError({ status: 404, code: "NOT_FOUND", message });
}

export function requestTimeout(message = "Request timed out"): AppError {
  return new AppError({ status: 408, code: "REQUEST_TIMEOUT", message });
}

export function conflict(message: string): AppError {
  return new AppError({ status: 409, code: "CONFLICT", message });
}

export function unprocessableEntity(
  message: string,
  details?: unknown,
): AppError {
  return new AppError({
    status: 422,
    code: "UNPROCESSABLE_ENTITY",
    message,
    details,
  });
}

export function upstreamError(message: string, details?: unknown): AppError {
  return new AppError({
    status: 502,
    code: "UPSTREAM_ERROR",
    message,
    details,
  });
}

export function serviceUnavailable(message: string): AppError {
  return new AppError({ status: 503, code: "SERVICE_UNAVAILABLE", message });
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ZodError) {
    return badRequest(error.message, error.flatten());
  }
  if (error instanceof Error && error.name === "AbortError") {
    return requestTimeout("Request timed out");
  }
  if (error instanceof Error) {
    return new AppError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: error.message || "Internal server error",
      cause: error,
    });
  }
  return new AppError({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    details: error,
  });
}
