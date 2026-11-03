import { describe, expect, it } from "vitest";
import { getProxyAuthConfig, isTrustedProxyAddress } from "./config";

describe("getProxyAuthConfig", () => {
  it("is disabled by default", () => {
    expect(getProxyAuthConfig({})).toBeNull();
  });

  it("stays disabled without a trusted proxy list", () => {
    expect(getProxyAuthConfig({ PROXY_AUTH_ENABLED: "true" })).toBeNull();
    expect(
      getProxyAuthConfig({
        PROXY_AUTH_ENABLED: "true",
        PROXY_AUTH_TRUSTED_PROXIES: "not-an-ip, 10.0.0.0/99",
      }),
    ).toBeNull();
  });

  it("applies defaults and normalizes header names", () => {
    const config = getProxyAuthConfig({
      PROXY_AUTH_ENABLED: "1",
      PROXY_AUTH_TRUSTED_PROXIES: "10.0.0.5",
    });
    expect(config?.userHeader).toBe("x-remote-user");
    expect(config?.displayNameHeader).toBeNull();
    expect(config?.allowSignup).toBe(false);

    const custom = getProxyAuthConfig({
      PROXY_AUTH_ENABLED: "true",
      PROXY_AUTH_TRUSTED_PROXIES: "10.0.0.5",
      PROXY_AUTH_USER_HEADER: "Remote-User",
      PROXY_AUTH_NAME_HEADER: "Remote-Name",
      PROXY_AUTH_ALLOW_SIGNUP: "yes",
    });
    expect(custom?.userHeader).toBe("remote-user");
    expect(custom?.displayNameHeader).toBe("remote-name");
    expect(custom?.allowSignup).toBe(true);
  });
});

describe("isTrustedProxyAddress", () => {
  const config = getProxyAuthConfig({
    PROXY_AUTH_ENABLED: "true",
    PROXY_AUTH_TRUSTED_PROXIES: "10.0.0.5, 172.18.0.0/16, ::1",
  });

  it("matches exact addresses and CIDR ranges", () => {
    if (!config) throw new Error("expected config");
    expect(isTrustedProxyAddress(config, "10.0.0.5")).toBe(true);
    expect(isTrustedProxyAddress(config, "172.18.4.9")).toBe(true);
    expect(isTrustedProxyAddress(config, "::1")).toBe(true);
  });

  it("unwraps IPv4-mapped IPv6 addresses", () => {
    if (!config) throw new Error("expected config");
    expect(isTrustedProxyAddress(config, "::ffff:10.0.0.5")).toBe(true);
  });

  it("rejects everything else", () => {
    if (!config) throw new Error("expected config");
    expect(isTrustedProxyAddress(config, "10.0.0.6")).toBe(false);
    expect(isTrustedProxyAddress(config, "172.19.0.1")).toBe(false);
    expect(isTrustedProxyAddress(config, "garbage")).toBe(false);
    expect(isTrustedProxyAddress(config, undefined)).toBe(false);
  });
});
