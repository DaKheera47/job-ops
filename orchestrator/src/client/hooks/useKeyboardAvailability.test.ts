import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetKeyboardAvailabilityForTests,
  detectKeyboardAvailability,
  useKeyboardAvailability,
} from "./useKeyboardAvailability";

const createMatchMedia = (matches: Record<string, boolean>) =>
  vi.fn().mockImplementation((query: string) => ({
    matches: matches[query] ?? false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));

const originalMatchMedia = window.matchMedia;
const maxTouchPointsDescriptor = Object.getOwnPropertyDescriptor(
  Navigator.prototype,
  "maxTouchPoints",
);

function setMaxTouchPoints(value: number) {
  Object.defineProperty(Navigator.prototype, "maxTouchPoints", {
    configurable: true,
    get: () => value,
  });
}

afterEach(() => {
  _resetKeyboardAvailabilityForTests();
  window.matchMedia = originalMatchMedia;
  if (maxTouchPointsDescriptor) {
    Object.defineProperty(
      Navigator.prototype,
      "maxTouchPoints",
      maxTouchPointsDescriptor,
    );
  } else {
    Reflect.deleteProperty(Navigator.prototype, "maxTouchPoints");
  }
});

describe("useKeyboardAvailability", () => {
  it("treats touch-only devices as not having a keyboard by default", () => {
    window.matchMedia = createMatchMedia({
      "(any-hover: hover)": false,
      "(any-pointer: fine)": false,
    }) as unknown as typeof window.matchMedia;
    setMaxTouchPoints(5);

    expect(detectKeyboardAvailability()).toBe(false);
  });

  it("switches on after the user presses a key", () => {
    window.matchMedia = createMatchMedia({
      "(any-hover: hover)": false,
      "(any-pointer: fine)": false,
    }) as unknown as typeof window.matchMedia;
    setMaxTouchPoints(5);

    const { result } = renderHook(() => useKeyboardAvailability());

    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }));
    });

    expect(result.current).toBe(true);
  });

  it("switches on after the user presses a key when matchMedia is unavailable", () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    setMaxTouchPoints(5);

    const { result } = renderHook(() => useKeyboardAvailability());

    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }));
    });

    expect(result.current).toBe(true);
  });

  it("preserves observed keyboard evidence across remounts", () => {
    window.matchMedia = createMatchMedia({
      "(any-hover: hover)": false,
      "(any-pointer: fine)": false,
    }) as unknown as typeof window.matchMedia;
    setMaxTouchPoints(5);

    const first = renderHook(() => useKeyboardAvailability());
    expect(first.result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control" }));
    });

    expect(first.result.current).toBe(true);
    first.unmount();

    const second = renderHook(() => useKeyboardAvailability());
    expect(second.result.current).toBe(true);
  });
});
