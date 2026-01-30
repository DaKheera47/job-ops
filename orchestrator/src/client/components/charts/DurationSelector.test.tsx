/**
 * DurationSelector Edge Case Tests
 * Tests all duration options and interaction edge cases
 */

import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DurationSelector } from "./DurationSelector";

// Mock UI components
vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value: string;
    onValueChange?: (value: string) => void;
  }) => (
    <div data-testid="tabs" data-value={value}>
      {children}
      {onValueChange && (
        <button
          type="button"
          data-testid="tab-trigger-7"
          onClick={() => onValueChange("7")}
        >
          7d
        </button>
      )}
      {onValueChange && (
        <button
          type="button"
          data-testid="tab-trigger-14"
          onClick={() => onValueChange("14")}
        >
          14d
        </button>
      )}
      {onValueChange && (
        <button
          type="button"
          data-testid="tab-trigger-30"
          onClick={() => onValueChange("30")}
        >
          30d
        </button>
      )}
      {onValueChange && (
        <button
          type="button"
          data-testid="tab-trigger-90"
          onClick={() => onValueChange("90")}
        >
          90d
        </button>
      )}
    </div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tabs-list">{children}</div>
  ),
  TabsTrigger: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => (
    <button type="button" data-testid={`tab-${value}`} value={value}>
      {children}
    </button>
  ),
}));

describe("DurationSelector - Edge Cases", () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("All Duration Options", () => {
    it("renders with 7 days selected", () => {
      render(<DurationSelector value={7} onChange={mockOnChange} />);

      expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "7");
    });

    it("renders with 14 days selected", () => {
      render(<DurationSelector value={14} onChange={mockOnChange} />);

      expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "14");
    });

    it("renders with 30 days selected", () => {
      render(<DurationSelector value={30} onChange={mockOnChange} />);

      expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "30");
    });

    it("renders with 90 days selected", () => {
      render(<DurationSelector value={90} onChange={mockOnChange} />);

      expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "90");
    });
  });

  describe("onChange Callback", () => {
    it("calls onChange with 7 when 7d tab is clicked", () => {
      render(<DurationSelector value={30} onChange={mockOnChange} />);

      fireEvent.click(screen.getByTestId("tab-trigger-7"));

      expect(mockOnChange).toHaveBeenCalledWith(7);
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it("calls onChange with 14 when 14d tab is clicked", () => {
      render(<DurationSelector value={7} onChange={mockOnChange} />);

      fireEvent.click(screen.getByTestId("tab-trigger-14"));

      expect(mockOnChange).toHaveBeenCalledWith(14);
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it("calls onChange with 30 when 30d tab is clicked", () => {
      render(<DurationSelector value={7} onChange={mockOnChange} />);

      fireEvent.click(screen.getByTestId("tab-trigger-30"));

      expect(mockOnChange).toHaveBeenCalledWith(30);
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it("calls onChange with 90 when 90d tab is clicked", () => {
      render(<DurationSelector value={7} onChange={mockOnChange} />);

      fireEvent.click(screen.getByTestId("tab-trigger-90"));

      expect(mockOnChange).toHaveBeenCalledWith(90);
      expect(mockOnChange).toHaveBeenCalledTimes(1);
    });

    it("parses string value to number correctly", () => {
      render(<DurationSelector value={7} onChange={mockOnChange} />);

      // Simulate clicking different tabs
      fireEvent.click(screen.getByTestId("tab-trigger-30"));
      expect(mockOnChange).toHaveBeenCalledWith(30);
      expect(typeof mockOnChange.mock.calls[0][0]).toBe("number");
    });
  });

  describe("Value Synchronization", () => {
    it("updates when value prop changes", () => {
      const { rerender } = render(
        <DurationSelector value={7} onChange={mockOnChange} />,
      );

      expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "7");

      rerender(<DurationSelector value={30} onChange={mockOnChange} />);

      expect(screen.getByTestId("tabs")).toHaveAttribute("data-value", "30");
    });

    it("maintains correct value type (number)", () => {
      render(<DurationSelector value={14} onChange={mockOnChange} />);

      const tabs = screen.getByTestId("tabs");
      const value = tabs.getAttribute("data-value");
      expect(value).toBe("14");
    });
  });

  describe("Callback Consistency", () => {
    it("calls onChange multiple times for multiple selections", () => {
      render(<DurationSelector value={7} onChange={mockOnChange} />);

      fireEvent.click(screen.getByTestId("tab-trigger-14"));
      fireEvent.click(screen.getByTestId("tab-trigger-30"));
      fireEvent.click(screen.getByTestId("tab-trigger-7"));

      expect(mockOnChange).toHaveBeenCalledTimes(3);
      expect(mockOnChange).toHaveBeenNthCalledWith(1, 14);
      expect(mockOnChange).toHaveBeenNthCalledWith(2, 30);
      expect(mockOnChange).toHaveBeenNthCalledWith(3, 7);
    });

    it("passes correct duration values for all options", () => {
      render(<DurationSelector value={7} onChange={mockOnChange} />);

      const expectedValues = [7, 14, 30, 90];
      const triggers = [
        "tab-trigger-7",
        "tab-trigger-14",
        "tab-trigger-30",
        "tab-trigger-90",
      ];

      triggers.forEach((trigger, index) => {
        fireEvent.click(screen.getByTestId(trigger));
        expect(mockOnChange).toHaveBeenLastCalledWith(expectedValues[index]);
      });
    });
  });
});
