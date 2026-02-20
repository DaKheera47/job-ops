import { describe, expect, it } from "vitest";
import { asyncPool } from "./async-pool";

describe("asyncPool", () => {
  it("preserves input order in output", async () => {
    const items = [1, 2, 3, 4];
    const result = await asyncPool({
      items,
      concurrency: 3,
      task: async (item) => {
        await new Promise((resolve) => setTimeout(resolve, (5 - item) * 5));
        return item * 10;
      },
    });

    expect(result).toEqual([10, 20, 30, 40]);
  });

  it("clamps non-finite and out-of-range concurrency values", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = Array.from({ length: 20 }, (_, index) => index);

    await asyncPool({
      items,
      concurrency: Number.NaN,
      task: async (item) => item,
    });

    await asyncPool({
      items,
      concurrency: 100,
      task: async (item) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 2));
        inFlight -= 1;
        return item;
      },
    });

    expect(maxInFlight).toBeLessThanOrEqual(10);
  });

  it("propagates task errors", async () => {
    await expect(
      asyncPool({
        items: [1, 2, 3],
        concurrency: 2,
        task: async (item) => {
          if (item === 2) throw new Error("boom");
          return item;
        },
      }),
    ).rejects.toThrow("boom");
  });

  it("returns only completed results when stopped early", async () => {
    let shouldStop = false;
    let completed = 0;

    const result = await asyncPool({
      items: [1, 2, 3, 4, 5],
      concurrency: 2,
      shouldStop: () => shouldStop,
      task: async (item) => {
        await new Promise((resolve) => setTimeout(resolve, 3));
        completed += 1;
        if (completed >= 2) shouldStop = true;
        return item;
      },
    });

    expect(result.length).toBeLessThan(5);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result.slice(0, 2)).toEqual([1, 2]);
  });

  it("emits task lifecycle callbacks", async () => {
    const started: number[] = [];
    const settled: Array<string> = [];

    await expect(
      asyncPool({
        items: [1, 2, 3],
        concurrency: 2,
        onTaskStarted: (item) => {
          started.push(item);
        },
        onTaskSettled: (item, _index, outcome) => {
          settled.push(
            outcome.status === "fulfilled"
              ? `${item}:ok`
              : `${item}:fail:${String(outcome.error)}`,
          );
        },
        task: async (item) => {
          if (item === 2) throw new Error("boom");
          await new Promise((resolve) => setTimeout(resolve, 5));
          return item * 2;
        },
      }),
    ).rejects.toThrow("boom");

    expect(started).toEqual(expect.arrayContaining([1, 2]));
    expect(settled).toContain("1:ok");
    expect(settled.some((entry) => entry.startsWith("2:fail:"))).toBe(true);
    expect(started).not.toContain(3);
  });

  it("ignores lifecycle hook failures", async () => {
    const result = await asyncPool({
      items: [1, 2],
      concurrency: 2,
      onTaskStarted: () => {
        throw new Error("hook failed");
      },
      onTaskSettled: () => {
        throw new Error("hook failed");
      },
      task: async (item) => item * 2,
    });

    expect(result).toEqual([2, 4]);
  });
});
