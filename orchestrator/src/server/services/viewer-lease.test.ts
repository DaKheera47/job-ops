import { describe, expect, it } from "vitest";
import { ViewerLease } from "./viewer-lease";

describe("ViewerLease", () => {
  it("prevents another private scope from accessing the same desktop", () => {
    const lease = new ViewerLease();
    const releaseA = lease.acquire("tenant-a:user-a");

    expect(releaseA).toBeTypeOf("function");
    expect(lease.acquire("tenant-b:user-b")).toBeNull();
    expect(lease.owns("tenant-a:user-a")).toBe(true);
    expect(lease.owns("tenant-b:user-b")).toBe(false);

    releaseA?.();
    expect(lease.acquire("tenant-b:user-b")).toBeTypeOf("function");
  });

  it("keeps the desktop leased until all same-scope users release it", () => {
    const lease = new ViewerLease();
    const first = lease.acquire("tenant-a");
    const second = lease.acquire("tenant-a");

    first?.();
    expect(lease.owns("tenant-a")).toBe(true);
    second?.();
    expect(lease.owns("tenant-a")).toBe(false);
  });
});
