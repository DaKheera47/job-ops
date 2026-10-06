import * as api from "@client/api";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPasskeySupported,
  PasskeyCancelledError,
  registerPasskey,
  signInWithPasskey,
} from "./passkeys";

vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: vi.fn(() => true),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));

vi.mock("@client/api", () => ({
  getPasskeyLoginOptions: vi.fn(),
  getPasskeyRegistrationOptions: vi.fn(),
  verifyPasskeyLogin: vi.fn(),
  verifyPasskeyRegistration: vi.fn(),
}));

const authUser = {
  id: "user-1",
  username: "admin",
  displayName: "Admin User",
  isSystemAdmin: true,
  isDisabled: false,
  workspaceId: "tenant_default",
  workspaceName: "JobOps",
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
};

const passkeySummary = {
  id: "credential-1",
  name: "Work laptop",
  deviceType: "multiDevice" as const,
  backedUp: true,
  transports: ["internal"],
  createdAt: "2026-05-13T00:00:00.000Z",
  lastUsedAt: null,
};

function ceremonyError(name: string): Error {
  const error = new Error(`${name} raised by the browser`);
  error.name = name;
  return error;
}

function setSecureContext(isSecureContext: boolean): void {
  Object.defineProperty(window, "isSecureContext", {
    configurable: true,
    value: isSecureContext,
  });
}

describe("passkeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(browserSupportsWebAuthn).mockReturnValue(true);
    setSecureContext(true);
  });

  it("reports support only when the browser implements WebAuthn", () => {
    expect(isPasskeySupported()).toBe(true);

    vi.mocked(browserSupportsWebAuthn).mockReturnValue(false);
    expect(isPasskeySupported()).toBe(false);
  });

  it("still reports support on localhost outside a secure context", () => {
    setSecureContext(false);
    expect(window.location.hostname).toBe("localhost");

    expect(isPasskeySupported()).toBe(true);
  });

  it("signs in with the challenge returned by the server", async () => {
    const options = { challenge: "challenge-value" };
    const response = { id: "credential-1", type: "public-key" };
    vi.mocked(api.getPasskeyLoginOptions).mockResolvedValue({
      challengeId: "challenge-1",
      options,
    });
    vi.mocked(startAuthentication).mockResolvedValue(
      response as unknown as Awaited<ReturnType<typeof startAuthentication>>,
    );
    vi.mocked(api.verifyPasskeyLogin).mockResolvedValue(authUser);

    await expect(signInWithPasskey()).resolves.toEqual(authUser);

    expect(startAuthentication).toHaveBeenCalledWith({ optionsJSON: options });
    expect(api.verifyPasskeyLogin).toHaveBeenCalledWith({
      challengeId: "challenge-1",
      response,
    });
  });

  it("maps a dismissed sign-in prompt to a cancellation", async () => {
    vi.mocked(api.getPasskeyLoginOptions).mockResolvedValue({
      challengeId: "challenge-1",
      options: {},
    });
    vi.mocked(startAuthentication).mockRejectedValue(
      ceremonyError("NotAllowedError"),
    );

    await expect(signInWithPasskey()).rejects.toBeInstanceOf(
      PasskeyCancelledError,
    );
    expect(api.verifyPasskeyLogin).not.toHaveBeenCalled();
  });

  it("registers a passkey and returns the stored summary", async () => {
    const options = { challenge: "challenge-value" };
    const response = { id: "credential-1", type: "public-key" };
    vi.mocked(api.getPasskeyRegistrationOptions).mockResolvedValue({ options });
    vi.mocked(startRegistration).mockResolvedValue(
      response as unknown as Awaited<ReturnType<typeof startRegistration>>,
    );
    vi.mocked(api.verifyPasskeyRegistration).mockResolvedValue(passkeySummary);

    await expect(registerPasskey("Work laptop")).resolves.toEqual(
      passkeySummary,
    );

    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: options });
    expect(api.verifyPasskeyRegistration).toHaveBeenCalledWith({
      name: "Work laptop",
      response,
    });
  });

  it("explains that the device already holds a passkey", async () => {
    vi.mocked(api.getPasskeyRegistrationOptions).mockResolvedValue({
      options: {},
    });
    vi.mocked(startRegistration).mockRejectedValue(
      ceremonyError("InvalidStateError"),
    );

    await expect(registerPasskey("Work laptop")).rejects.toThrow(
      "This device already has a passkey for your account",
    );
    expect(api.verifyPasskeyRegistration).not.toHaveBeenCalled();
  });

  it("rethrows unexpected ceremony failures unchanged", async () => {
    vi.mocked(api.getPasskeyRegistrationOptions).mockResolvedValue({
      options: {},
    });
    vi.mocked(startRegistration).mockRejectedValue(
      ceremonyError("SecurityError"),
    );

    await expect(registerPasskey()).rejects.toThrow(
      "SecurityError raised by the browser",
    );
  });
});
