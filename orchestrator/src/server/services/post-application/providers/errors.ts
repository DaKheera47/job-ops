import {
  AppError,
  badRequest,
  serviceUnavailable,
  upstreamError,
} from "@infra/errors";

export type PostApplicationProviderErrorKind =
  | "invalid_request"
  | "not_implemented"
  | "service_unavailable"
  | "upstream";

export class PostApplicationProviderError extends Error {
  constructor(
    readonly kind: PostApplicationProviderErrorKind,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PostApplicationProviderError";
  }
}

export function providerInvalidRequest(
  message: string,
  details?: unknown,
): PostApplicationProviderError {
  return new PostApplicationProviderError("invalid_request", message, details);
}

export function providerNotImplemented(
  message: string,
  details?: unknown,
): PostApplicationProviderError {
  return new PostApplicationProviderError("not_implemented", message, details);
}

export function providerServiceUnavailable(
  message: string,
  details?: unknown,
): PostApplicationProviderError {
  return new PostApplicationProviderError(
    "service_unavailable",
    message,
    details,
  );
}

export function providerUpstreamError(
  message: string,
  details?: unknown,
): PostApplicationProviderError {
  return new PostApplicationProviderError("upstream", message, details);
}

export function toProviderAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof PostApplicationProviderError) {
    if (error.kind === "invalid_request") {
      return badRequest(error.message, error.details);
    }

    if (error.kind === "upstream") {
      return upstreamError(error.message, error.details);
    }

    return serviceUnavailable(error.message);
  }

  if (error instanceof Error) {
    return new AppError({
      status: 500,
      code: "INTERNAL_ERROR",
      message: error.message || "Provider action failed",
      cause: error,
    });
  }

  return new AppError({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Provider action failed",
    details: error,
  });
}
