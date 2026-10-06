import { basename, dirname } from "node:path";
import { runWithRequestContext } from "@infra/request-context";
import { describe, expect, it } from "vitest";
import { getPrivateCloudflareCookieStorageDir } from "./private-scope";

describe("private Cloudflare cookie storage", () => {
  it("uses distinct directories for different tenants", () => {
    const forTenant = (tenantId: string) =>
      runWithRequestContext({ requestId: "test", tenantId }, () =>
        getPrivateCloudflareCookieStorageDir(),
      );

    const tenantA = forTenant("tenant-a");
    const tenantB = forTenant("tenant-b");
    expect(tenantA).not.toBe(tenantB);
    expect(forTenant("tenant-a")).toBe(tenantA);
    expect(basename(dirname(tenantA))).toBe("cloudflare-cookies");
    expect(basename(tenantA)).toMatch(/^[a-f0-9]{64}$/);
  });
});
