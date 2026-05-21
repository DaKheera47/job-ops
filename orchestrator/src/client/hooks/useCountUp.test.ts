import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCountUp } from "./useCountUp";

describe("useCountUp", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns null when target is null", () => {
    const { result } = renderHook(() => useCountUp(null));
    expect(result.current).toBeNull();
  });

  it("immediately returns target in test environment", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useCountUp(target),
      {
        initialProps: { target: 50 },
      },
    );
    expect(result.current).toBe(50);

    rerender({ target: 75 });
    expect(result.current).toBe(75);
  });

  it("animates from start to end when not in test environment", () => {
    process.env.NODE_ENV = "development";
    vi.useFakeTimers();

    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);

    const callbacks: ((time: number) => void)[] = [];
    const mockRequestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((cb) => {
        callbacks.push(cb);
        return callbacks.length;
      });

    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { result, rerender } = renderHook(
      ({ target }) => useCountUp(target, 600),
      {
        initialProps: { target: 100 },
      },
    );

    // Initial count is target on mount: 100
    expect(result.current).toBe(100);
    expect(mockRequestAnimationFrame).toHaveBeenCalled();

    // Trigger RAF at t=0
    act(() => {
      const cb = callbacks.shift();
      cb?.(0);
    });
    expect(result.current).toBe(0);

    // Trigger RAF at t=300ms (50% progress)
    now = 300;
    act(() => {
      const cb = callbacks.shift();
      cb?.(300);
    });
    // progress = 0.5. ease = 0.5 * (2 - 0.5) = 0.75.
    // count = 0 + 100 * 0.75 = 75
    expect(result.current).toBe(75);

    // Trigger RAF at t=600ms (100% progress)
    now = 600;
    act(() => {
      const cb = callbacks.shift();
      cb?.(600);
    });
    expect(result.current).toBe(100);

    // Update target to 50
    rerender({ target: 50 });
    expect(mockRequestAnimationFrame).toHaveBeenCalled();

    // Trigger RAF at relative start (now = 600)
    now = 600;
    act(() => {
      const cb = callbacks.shift();
      cb?.(600);
    });
    expect(result.current).toBe(100);

    // Trigger RAF at relative t=300 (now = 900)
    now = 900;
    act(() => {
      const cb = callbacks.shift();
      cb?.(900);
    });
    // start = 100, end = 50. progress = 300 / 600 = 0.5. ease = 0.75.
    // count = Math.round(100 + (50 - 100) * 0.75) = Math.round(100 - 37.5) = 63
    expect(result.current).toBe(63);
  });
});
