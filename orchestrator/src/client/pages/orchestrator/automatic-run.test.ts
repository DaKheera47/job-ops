import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTOMATIC_PRESETS,
  deriveExtractorLimits,
  getRunMemoryStorageKey,
  inferAutomaticPresetSelection,
  loadAutomaticRunMemory,
  parseSearchTermsInput,
  RUN_MEMORY_STORAGE_KEY,
  saveAutomaticRunMemory,
} from "./automatic-run";

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

describe("automatic-run utilities", () => {
  beforeEach(() => {
    ensureStorage().clear();
    ensureSessionStorage().clear();
  });

  it("exposes the expected preset values", () => {
    expect(AUTOMATIC_PRESETS.fast).toEqual({
      topN: 5,
      minSuitabilityScore: 75,
      runBudget: 300,
    });

    expect(AUTOMATIC_PRESETS.detailed.topN).toBeGreaterThan(
      AUTOMATIC_PRESETS.fast.topN,
    );
  });

  it("keeps discovered cap under budget regardless of search-term count", () => {
    const limits = deriveExtractorLimits({
      budget: 750,
      searchTerms: ["a", "b", "c"],
      sources: ["indeed", "linkedin", "glassdoor", "gradcracker"],
    });

    const cap =
      3 * limits.jobspyResultsWanted * 3 + limits.gradcrackerMaxJobsPerTerm * 3;

    expect(cap).toBeLessThanOrEqual(750);
  });

  it("assigns a dedicated startupjobs max-jobs limit", () => {
    const limits = deriveExtractorLimits({
      budget: 120,
      searchTerms: ["backend", "platform"],
      sources: ["startupjobs"],
    });

    expect(limits.startupjobsMaxJobsPerTerm).toBeGreaterThan(0);
    expect(limits.startupjobsMaxJobsPerTerm).toBe(150);
  });

  it("assigns a dedicated Jobindex max-jobs limit", () => {
    const limits = deriveExtractorLimits({
      budget: 120,
      searchTerms: ["backend", "platform"],
      sources: ["jobindex"],
    });

    expect(limits.jobindexMaxJobsPerTerm).toBeGreaterThan(0);
    expect(limits.jobindexMaxJobsPerTerm).toBe(150);
  });

  it("raises legacy custom budgets to the 300-job minimum", () => {
    ensureStorage().setItem(
      RUN_MEMORY_STORAGE_KEY,
      JSON.stringify({
        topN: 5,
        minSuitabilityScore: 65,
        runBudget: 25,
        presetId: "custom",
      }),
    );

    expect(loadAutomaticRunMemory()?.runBudget).toBe(300);
  });

  it("infers the balanced preset from legacy memory without an explicit preset id", () => {
    ensureStorage().setItem(
      RUN_MEMORY_STORAGE_KEY,
      JSON.stringify({
        topN: AUTOMATIC_PRESETS.balanced.topN,
        minSuitabilityScore: AUTOMATIC_PRESETS.balanced.minSuitabilityScore,
      }),
    );

    expect(loadAutomaticRunMemory()).toEqual({
      topN: AUTOMATIC_PRESETS.balanced.topN,
      minSuitabilityScore: AUTOMATIC_PRESETS.balanced.minSuitabilityScore,
      runBudget: AUTOMATIC_PRESETS.balanced.runBudget,
      presetId: "balanced",
    });
  });

  it("preserves explicit custom memory even when the numbers match a preset", () => {
    ensureStorage().setItem(
      RUN_MEMORY_STORAGE_KEY,
      JSON.stringify({
        topN: AUTOMATIC_PRESETS.balanced.topN,
        minSuitabilityScore: AUTOMATIC_PRESETS.balanced.minSuitabilityScore,
        runBudget: AUTOMATIC_PRESETS.balanced.runBudget,
        presetId: "custom",
      }),
    );

    expect(loadAutomaticRunMemory()).toEqual({
      topN: AUTOMATIC_PRESETS.balanced.topN,
      minSuitabilityScore: AUTOMATIC_PRESETS.balanced.minSuitabilityScore,
      runBudget: AUTOMATIC_PRESETS.balanced.runBudget,
      presetId: "custom",
    });
  });

  it("scopes run memory to the authenticated workspace", () => {
    const sessionStorage = ensureSessionStorage();
    sessionStorage.setItem("jobops.authToken", makeAuthToken("tenant-one"));

    saveAutomaticRunMemory({
      topN: 6,
      minSuitabilityScore: 70,
      runBudget: 300,
      presetId: "custom",
    });

    expect(getRunMemoryStorageKey()).toBe(
      `${RUN_MEMORY_STORAGE_KEY}:workspace:tenant-one`,
    );

    sessionStorage.setItem("jobops.authToken", makeAuthToken("tenant-two"));
    expect(loadAutomaticRunMemory()).toBeNull();

    saveAutomaticRunMemory({
      topN: 12,
      minSuitabilityScore: 40,
      runBudget: 600,
      presetId: "custom",
    });

    expect(loadAutomaticRunMemory()).toMatchObject({
      topN: 12,
      minSuitabilityScore: 40,
    });

    sessionStorage.setItem("jobops.authToken", makeAuthToken("tenant-one"));
    expect(loadAutomaticRunMemory()).toMatchObject({
      topN: 6,
      minSuitabilityScore: 70,
    });
  });

  it("migrates legacy run memory into the workspace-scoped key", () => {
    const sessionStorage = ensureSessionStorage();
    const localStorage = ensureStorage();
    sessionStorage.setItem("jobops.authToken", makeAuthToken("tenant-one"));
    localStorage.setItem(
      RUN_MEMORY_STORAGE_KEY,
      JSON.stringify({
        topN: 8,
        minSuitabilityScore: 65,
        runBudget: 350,
        presetId: "custom",
      }),
    );

    expect(loadAutomaticRunMemory()).toEqual({
      topN: 8,
      minSuitabilityScore: 65,
      runBudget: 350,
      presetId: "custom",
    });
    expect(
      localStorage.getItem(`${RUN_MEMORY_STORAGE_KEY}:workspace:tenant-one`),
    ).toBe(localStorage.getItem(RUN_MEMORY_STORAGE_KEY));
  });

  it("infers custom when legacy values do not match a preset", () => {
    expect(
      inferAutomaticPresetSelection({
        topN: 7,
        minSuitabilityScore: 60,
      }),
    ).toBe("custom");
  });

  it("parses comma and newline separated search terms", () => {
    expect(parseSearchTermsInput("backend, platform\napi\n\n")).toEqual([
      "backend",
      "platform",
      "api",
    ]);
  });
});
