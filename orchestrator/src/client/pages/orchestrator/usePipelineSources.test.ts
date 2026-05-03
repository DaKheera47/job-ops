import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { PIPELINE_SOURCES_STORAGE_KEY } from "./constants";
import {
  getPipelineSourcesStorageKey,
  usePipelineSources,
} from "./usePipelineSources";

function ensureStorage(): Storage {
  const existing = globalThis.localStorage as Partial<Storage> | undefined;
  const hasStorageShape =
    existing &&
    typeof existing.getItem === "function" &&
    typeof existing.setItem === "function" &&
    typeof existing.removeItem === "function" &&
    typeof existing.clear === "function";

  if (hasStorageShape) {
    return existing as Storage;
  }

  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      const value = store.get(key);
      return value ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });

  return storage;
}

function ensureSessionStorage(): Storage {
  const existing = globalThis.sessionStorage as Partial<Storage> | undefined;
  const hasStorageShape =
    existing &&
    typeof existing.getItem === "function" &&
    typeof existing.setItem === "function" &&
    typeof existing.removeItem === "function" &&
    typeof existing.clear === "function";

  if (hasStorageShape) {
    return existing as Storage;
  }

  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      const value = store.get(key);
      return value ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "sessionStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });

  return storage;
}

function makeAuthToken(tenantId: string): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ tenantId }),
    "signature",
  ].join(".");
}

describe("usePipelineSources", () => {
  beforeEach(() => {
    ensureStorage().clear();
    ensureSessionStorage().clear();
  });

  it("filters stored sources to enabled sources", () => {
    ensureStorage().setItem(
      PIPELINE_SOURCES_STORAGE_KEY,
      JSON.stringify(["gradcracker", "ukvisajobs"]),
    );

    const enabledSources = ["gradcracker"] as const;

    const { result } = renderHook(() => usePipelineSources(enabledSources));

    expect(result.current.pipelineSources).toEqual(["gradcracker"]);
  });

  it("falls back to the first enabled source", () => {
    ensureStorage().setItem(
      PIPELINE_SOURCES_STORAGE_KEY,
      JSON.stringify(["ukvisajobs"]),
    );

    const enabledSources = ["gradcracker", "linkedin"] as const;

    const { result } = renderHook(() => usePipelineSources(enabledSources));

    expect(result.current.pipelineSources).toEqual(["gradcracker"]);
  });

  it("ignores toggles for disabled sources", () => {
    ensureStorage().setItem(
      PIPELINE_SOURCES_STORAGE_KEY,
      JSON.stringify(["gradcracker"]),
    );

    const enabledSources = ["gradcracker"] as const;

    const { result } = renderHook(() => usePipelineSources(enabledSources));

    act(() => {
      result.current.toggleSource("ukvisajobs", true);
    });

    expect(result.current.pipelineSources).toEqual(["gradcracker"]);
  });

  it("loads and saves sources using workspace-scoped storage keys", () => {
    const sessionStorage = ensureSessionStorage();
    sessionStorage.setItem("jobops.authToken", makeAuthToken("tenant-one"));
    ensureStorage().setItem(
      getPipelineSourcesStorageKey(),
      JSON.stringify(["ukvisajobs"]),
    );

    sessionStorage.setItem("jobops.authToken", makeAuthToken("tenant-two"));
    ensureStorage().setItem(
      getPipelineSourcesStorageKey(),
      JSON.stringify(["linkedin"]),
    );

    sessionStorage.setItem("jobops.authToken", makeAuthToken("tenant-one"));
    const enabledSources = ["ukvisajobs", "linkedin"] as const;
    const { result } = renderHook(() => usePipelineSources(enabledSources));

    expect(getPipelineSourcesStorageKey()).toBe(
      `${PIPELINE_SOURCES_STORAGE_KEY}:workspace:tenant-one`,
    );
    expect(result.current.pipelineSources).toEqual(["ukvisajobs"]);

    act(() => {
      result.current.toggleSource("linkedin", true);
    });

    expect(
      JSON.parse(
        ensureStorage().getItem(
          `${PIPELINE_SOURCES_STORAGE_KEY}:workspace:tenant-one`,
        ) ?? "[]",
      ),
    ).toEqual(["ukvisajobs", "linkedin"]);
    expect(
      JSON.parse(
        ensureStorage().getItem(
          `${PIPELINE_SOURCES_STORAGE_KEY}:workspace:tenant-two`,
        ) ?? "[]",
      ),
    ).toEqual(["linkedin"]);
  });
});
