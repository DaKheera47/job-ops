import { serviceUnavailable } from "@infra/errors";
import type { Request } from "express";

export type WebAuthnRelyingParty = {
  rpID: string;
  rpName: string;
  expectedOrigin: string[];
};

const DEFAULT_RP_NAME = "JobOps";
const DEV_ORIGIN_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function parseOrigin(value: string | undefined): URL | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed);
  } catch {
    return null;
  }
}

function configuredOrigins(): URL[] {
  const raw = process.env.WEBAUTHN_ORIGINS?.trim();
  if (!raw) return [];

  const origins: URL[] = [];
  for (const entry of raw.split(",")) {
    const parsed = parseOrigin(entry);
    if (parsed) origins.push(parsed);
  }
  return origins;
}

/**
 * Development fallback for the Vite dev server: its proxy rewrites `Host` but
 * not `Origin`, and `trust proxy` is not enabled, so nothing derived from the
 * request itself is trustworthy in production.
 */
function developmentRequestOrigin(req: Request): URL | null {
  if (process.env.NODE_ENV === "production") return null;
  const parsed = parseOrigin(req.header("origin"));
  if (!parsed || !DEV_ORIGIN_HOSTNAMES.has(parsed.hostname)) return null;
  return parsed;
}

export function resolveWebAuthnRelyingParty(
  req: Request,
): WebAuthnRelyingParty {
  const publicBaseUrl = parseOrigin(process.env.JOBOPS_PUBLIC_BASE_URL);
  const devOrigin = developmentRequestOrigin(req);

  let origins = configuredOrigins();
  if (origins.length === 0 && publicBaseUrl) origins = [publicBaseUrl];
  if (origins.length === 0 && devOrigin) origins = [devOrigin];

  if (origins.length === 0) {
    throw serviceUnavailable(
      "Passkeys are not configured. Set WEBAUTHN_ORIGINS (or JOBOPS_PUBLIC_BASE_URL) to the public URL of this JobOps instance.",
    );
  }

  return {
    rpID: process.env.WEBAUTHN_RP_ID?.trim() || origins[0].hostname,
    rpName: process.env.WEBAUTHN_RP_NAME?.trim() || DEFAULT_RP_NAME,
    expectedOrigin: origins.map((origin) => origin.origin),
  };
}
