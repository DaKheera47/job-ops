import { badRequest } from "@infra/errors";

type DecodeBase64UploadOptions = {
  dataBase64: string;
  maxBytes: number;
  emptyMessage: string;
  invalidMessage: string;
  tooLargeMessage: string;
};

export function decodeBase64Upload({
  dataBase64,
  maxBytes,
  emptyMessage,
  invalidMessage,
  tooLargeMessage,
}: DecodeBase64UploadOptions): Buffer {
  const trimmed = dataBase64.trim();
  if (!trimmed) {
    throw badRequest(emptyMessage);
  }

  const normalized = trimmed.replace(/\s+/g, "");
  if (!normalized) {
    throw badRequest(emptyMessage);
  }

  if (
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw badRequest(invalidMessage);
  }

  const paddingLength = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  const estimatedByteLength = (normalized.length / 4) * 3 - paddingLength;
  if (estimatedByteLength > maxBytes) {
    throw badRequest(tooLargeMessage);
  }

  const decoded = Buffer.from(normalized, "base64");
  if (decoded.toString("base64") !== normalized) {
    throw badRequest(invalidMessage);
  }

  if (decoded.byteLength === 0) {
    throw badRequest(emptyMessage);
  }

  if (decoded.byteLength > maxBytes) {
    throw badRequest(tooLargeMessage);
  }

  return decoded;
}
