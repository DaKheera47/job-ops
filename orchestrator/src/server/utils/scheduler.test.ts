import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { calculateNextTime, createScheduler } from "./scheduler.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calculateNextTime", () => {
  it("should return today if hour is in the future", () => {
    const now = new Date("2026-01-15T10:00:00Z");
    vi.setSystemTime(now);

    const result = calculateNextTime(14); // 2 PM

    expect(result.getUTCHours()).toBe(14);
    expect(result.getUTCDate()).toBe(15); // Same day
    expect(result.getTime()).toBeGreaterThan(now.getTime());
  });

  it("should return tomorrow if hour has passed today", () => {
    const now = new Date("2026-01-15T16:00:00Z");
    vi.setSystemTime(now);

    const result = calculateNextTime(10); // 10 AM (already passed)

    expect(result.getUTCHours()).toBe(10);
    expect(result.getUTCDate()).toBe(16); // Next day
  });

  it("should return tomorrow if current time equals target hour", () => {
    const now = new Date("2026-01-15T14:00:00Z");
    vi.setSystemTime(now);

    const result = calculateNextTime(14); // Same hour

    expect(result.getUTCHours()).toBe(14);
    expect(result.getUTCDate()).toBe(16); // Next day (since we're at exactly 14:00)
  });

  it("should handle hour 0 (midnight)", () => {
    const now = new Date("2026-01-15T12:00:00Z");
    vi.setSystemTime(now);

    const result = calculateNextTime(0); // Midnight

    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCDate()).toBe(16); // Next day
  });

  it("should handle hour 23", () => {
    const now = new Date("2026-01-15T10:00:00Z");
    vi.setSystemTime(now);

    const result = calculateNextTime(23);

    expect(result.getUTCHours()).toBe(23);
    expect(result.getUTCDate()).toBe(15); // Same day
  });
});

describe("createScheduler", () => {
  it("should create a scheduler with initial stopped state", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = createScheduler("test", callback);

    expect(scheduler.isRunning()).toBe(false);
    expect(scheduler.getNextRun()).toBeNull();
  });

  it("should start scheduling when start() is called", () => {
    const now = new Date("2026-01-15T10:00:00Z");
    vi.setSystemTime(now);

    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = createScheduler("test", callback);

    scheduler.start(14);

    expect(scheduler.isRunning()).toBe(true);
    expect(scheduler.getNextRun()).not.toBeNull();
  });

  it("should stop scheduling when stop() is called", () => {
    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = createScheduler("test", callback);

    scheduler.start(14);
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
    expect(scheduler.getNextRun()).toBeNull();
  });

  it("should execute callback after delay (simulated)", async () => {
    const now = new Date("2026-01-15T10:00:00Z");
    vi.setSystemTime(now);

    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = createScheduler("test", callback);

    // Start at hour 10 tomorrow (24 hours from now in this test)
    scheduler.start(10);

    // Fast-forward time by 24 hours to trigger the callback
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(callback).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it("should reschedule after execution", async () => {
    const now = new Date("2026-01-15T10:00:00Z");
    vi.setSystemTime(now);

    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = createScheduler("test", callback);

    scheduler.start(10);
    const firstRun = scheduler.getNextRun();

    // Fast-forward 24 hours to trigger execution and rescheduling
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    const secondRun = scheduler.getNextRun();

    // Second run should be 24 hours after first run
    expect(secondRun).not.toBe(firstRun);
    expect(secondRun).not.toBeNull();
    expect(firstRun).not.toBeNull();
    if (secondRun && firstRun) {
      expect(new Date(secondRun).getTime()).toBe(
        new Date(firstRun).getTime() + 24 * 60 * 60 * 1000,
      );
    }

    scheduler.stop();
  });

  it("should restart with new hour when start() called again", () => {
    const now = new Date("2026-01-15T10:00:00Z");
    vi.setSystemTime(now);

    const callback = vi.fn().mockResolvedValue(undefined);
    const scheduler = createScheduler("test", callback);

    scheduler.start(14); // 2 PM
    const firstRun = scheduler.getNextRun();

    scheduler.start(16); // 4 PM
    const secondRun = scheduler.getNextRun();

    // Second run should be later than first run
    expect(secondRun).not.toBeNull();
    expect(firstRun).not.toBeNull();
    if (secondRun && firstRun) {
      expect(new Date(secondRun).getTime()).toBeGreaterThan(
        new Date(firstRun).getTime(),
      );
    }

    scheduler.stop();
  });

  it("should handle callback errors gracefully", async () => {
    const now = new Date("2026-01-15T10:00:00Z");
    vi.setSystemTime(now);

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const callback = vi.fn().mockRejectedValue(new Error("Test error"));
    const scheduler = createScheduler("test", callback);

    scheduler.start(10);

    // Fast-forward 24 hours to trigger execution
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(callback).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      "❌ [test] Scheduled task failed:",
      expect.any(Error),
    );

    // Scheduler should still be running after error
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    consoleSpy.mockRestore();
  });
});
