import type { AppError } from "@infra/errors";
import type { Request } from "express";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveWebAuthnRelyingParty } from "./relying-party";

const originalEnv = { ...process.env };

function createRequest(origin?: string): Request {
  return {
    header: (name: string) =>
      name.toLowerCase() === "origin" ? origin : undefined,
  } as unknown as Request;
}

function captureThrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("Expected relying party resolution to throw");
}

describe("resolveWebAuthnRelyingParty", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test" };
    delete process.env.WEBAUTHN_ORIGINS;
    delete process.env.WEBAUTHN_RP_ID;
    delete process.env.WEBAUTHN_RP_NAME;
    delete process.env.JOBOPS_PUBLIC_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prefers WEBAUTHN_ORIGINS over every other source", () => {
    process.env.WEBAUTHN_ORIGINS =
      "https://jobops.example, https://alt.jobops.example/";
    process.env.JOBOPS_PUBLIC_BASE_URL = "https://ignored.example";

    expect(
      resolveWebAuthnRelyingParty(createRequest("http://localhost:5173")),
    ).toEqual({
      rpID: "jobops.example",
      rpName: "JobOps",
      expectedOrigin: ["https://jobops.example", "https://alt.jobops.example"],
    });
  });

  it("falls back to the origin of JOBOPS_PUBLIC_BASE_URL", () => {
    process.env.JOBOPS_PUBLIC_BASE_URL = "https://jobops.example/app";

    expect(resolveWebAuthnRelyingParty(createRequest())).toEqual({
      rpID: "jobops.example",
      rpName: "JobOps",
      expectedOrigin: ["https://jobops.example"],
    });
  });

  it("accepts a loopback request origin outside production", () => {
    expect(
      resolveWebAuthnRelyingParty(createRequest("http://localhost:5173")),
    ).toMatchObject({
      rpID: "localhost",
      expectedOrigin: ["http://localhost:5173"],
    });

    expect(
      resolveWebAuthnRelyingParty(createRequest("http://127.0.0.1:3001")),
    ).toMatchObject({
      rpID: "127.0.0.1",
      expectedOrigin: ["http://127.0.0.1:3001"],
    });
  });

  it("ignores a request origin that is not loopback", () => {
    expect(
      captureThrown(() =>
        resolveWebAuthnRelyingParty(createRequest("https://attacker.example")),
      ),
    ).toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    } satisfies Partial<AppError>);
  });

  it("ignores the request origin in production", () => {
    process.env.NODE_ENV = "production";

    expect(
      captureThrown(() =>
        resolveWebAuthnRelyingParty(createRequest("http://localhost:5173")),
      ),
    ).toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
    } satisfies Partial<AppError>);
  });

  it("explains how to configure passkeys when nothing is set", () => {
    const error = captureThrown(() =>
      resolveWebAuthnRelyingParty(createRequest()),
    );

    expect((error as AppError).message).toContain("WEBAUTHN_ORIGINS");
    expect((error as AppError).message).toContain("JOBOPS_PUBLIC_BASE_URL");
  });

  it("honours explicit relying party id and name", () => {
    process.env.WEBAUTHN_ORIGINS = "https://jobs.jobops.example";
    process.env.WEBAUTHN_RP_ID = "jobops.example";
    process.env.WEBAUTHN_RP_NAME = "Acme Careers";

    expect(resolveWebAuthnRelyingParty(createRequest())).toEqual({
      rpID: "jobops.example",
      rpName: "Acme Careers",
      expectedOrigin: ["https://jobs.jobops.example"],
    });
  });
});
