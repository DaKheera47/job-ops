import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes } from "react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchableDropdown } from "./searchable-dropdown";

vi.mock("@/components/ui/button", () => ({
  Button: React.forwardRef<
    HTMLButtonElement,
    ButtonHTMLAttributes<HTMLButtonElement>
  >(({ className, children, ...props }, ref) => (
    <button ref={ref} className={className} {...props}>
      {children}
    </button>
  )),
}));
vi.mock("@/components/ui/virtualized-listbox", () => {
  const React = require("react") as typeof import("react");
  const windowSize = 8;

  return {
    useVirtualizedListbox: ({ count }: { count: number }) => {
      const [startIndex, setStartIndex] = React.useState(0);
      const visibleCount = Math.min(windowSize, count);
      const maxStart = Math.max(0, count - visibleCount);
      const virtualItems = React.useMemo(
        () =>
          Array.from({ length: visibleCount }, (_, offset) => {
            const index = startIndex + offset;
            return {
              key: index,
              index,
              lane: 0,
              start: offset * 40,
              end: (offset + 1) * 40,
              size: 40,
            };
          }),
        [startIndex, visibleCount],
      );

      return {
        getTotalSize: () => count * 40,
        getVirtualItems: () => virtualItems,
        measureElement: vi.fn(),
        scrollToIndex: (index: number) => {
          const nextStart = Math.min(
            Math.max(0, index - Math.floor(windowSize / 2)),
            maxStart,
          );
          setStartIndex(nextStart);
        },
      };
    },
  };
});
vi.mock("@/lib/utils", () => ({
  cn: (...inputs: Array<string | false | null | undefined>) =>
    inputs.filter(Boolean).join(" "),
}));

const buildOptions = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    value: `option-${index}`,
    label: `Option ${index}`,
  }));

describe("SearchableDropdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only mounts the visible window for large option sets", async () => {
    render(
      <SearchableDropdown
        value=""
        options={buildOptions(150)}
        onValueChange={vi.fn()}
        placeholder="Choose an option"
        ariaLabel="Choose option"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose option" }));

    await screen.findByRole("listbox");
    expect(screen.getAllByRole("combobox")).toHaveLength(1);

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Option 0" })).toBeVisible();
    });

    const firstOption = screen.getByRole("option", { name: "Option 0" });
    expect(firstOption.id).toContain("-option-");
    expect(firstOption.id).not.toContain(" ");
    expect(screen.queryByRole("option", { name: "Option 90" })).toBeNull();
  });

  it("selects an offscreen result after scrolling to it", async () => {
    const onValueChange = vi.fn();

    render(
      <SearchableDropdown
        value=""
        options={buildOptions(120)}
        onValueChange={onValueChange}
        placeholder="Choose an option"
        ariaLabel="Choose option"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose option" }));

    await screen.findByRole("listbox");

    const input = screen.getByPlaceholderText("Search...");
    fireEvent.keyDown(input, { key: "End" });

    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: "Option 119" }),
      ).toBeInTheDocument();
    });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onValueChange).toHaveBeenCalledWith("option-119");
  });

  it("preserves custom value entry and disabled option handling", () => {
    const onValueChange = vi.fn();

    render(
      <SearchableDropdown
        value=""
        options={[
          { value: "disabled", label: "Disabled option", disabled: true },
          { value: "enabled", label: "Enabled option" },
        ]}
        onValueChange={onValueChange}
        placeholder="Choose an option"
        ariaLabel="Choose option"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose option" }));
    fireEvent.change(screen.getByPlaceholderText("Search..."), {
      target: { value: "Custom company" },
    });

    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("option", { name: 'Use "Custom company"' }),
    );

    expect(onValueChange).toHaveBeenCalledWith("Custom company");

    fireEvent.click(screen.getByRole("button", { name: "Choose option" }));
    fireEvent.click(screen.getByRole("option", { name: "Disabled option" }));

    expect(onValueChange).toHaveBeenCalledTimes(1);
  });

  it("keeps aria-selected tied to the selected value instead of focus", async () => {
    render(
      <SearchableDropdown
        value="option-1"
        options={buildOptions(30)}
        onValueChange={vi.fn()}
        placeholder="Choose an option"
        ariaLabel="Choose option"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Choose option" }));

    await screen.findByRole("listbox");

    const input = screen.getByPlaceholderText("Search...");
    fireEvent.keyDown(input, { key: "ArrowDown" });

    const selectedOption = screen.getByRole("option", { name: "Option 1" });
    const activeOption = screen.getByRole("option", { name: "Option 2" });

    expect(selectedOption).toHaveAttribute("aria-selected", "true");
    expect(activeOption).toHaveAttribute("aria-selected", "false");
  });
});
