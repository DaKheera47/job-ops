import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnimatedNumber } from "./AnimatedNumber";

describe("AnimatedNumber", () => {
  it("renders a number correctly", () => {
    render(<AnimatedNumber>{42}</AnimatedNumber>);
    const element = screen.getByRole("img", { name: "42" });
    expect(element).toBeInTheDocument();
  });

  it("handles prefixes and suffixes", () => {
    render(
      <AnimatedNumber prefix="$" suffix=" USD">
        42.5
      </AnimatedNumber>,
    );
    const element = screen.getByRole("img", { name: "$42.5 USD" });
    expect(element).toBeInTheDocument();
  });

  it("handles locales and formats", () => {
    render(
      <AnimatedNumber
        locales="de-DE"
        format={{ style: "currency", currency: "EUR" }}
      >
        1234.56
      </AnimatedNumber>,
    );
    const element = screen.getByRole("img");
    expect(element.getAttribute("aria-label")).toMatch(/1\.234,56/);
  });

  it("keeps digit columns in stable tabular slots while values update", () => {
    const { container, rerender } = render(
      <AnimatedNumber>{92}</AnimatedNumber>,
    );

    rerender(<AnimatedNumber>{93}</AnimatedNumber>);

    expect(screen.getByRole("img", { name: "93" })).toBeInTheDocument();

    const digitSlots = Array.from(
      container.querySelectorAll<HTMLElement>("[data-animated-number-digit]"),
    );

    expect(digitSlots).toHaveLength(2);
    for (const slot of digitSlots) {
      expect(slot.style.width).toBe("1ch");
      expect(slot.style.minWidth).toBe("1ch");
      expect(slot.style.maxWidth).toBe("1ch");
      expect(slot.style.flex).toBe("0 0 1ch");
      expect(slot.style.fontVariantNumeric).toBe("tabular-nums");
    }
  });

  it("keeps digit slots aligned when the number gains a digit", () => {
    const { container, rerender } = render(
      <AnimatedNumber>{99}</AnimatedNumber>,
    );

    rerender(<AnimatedNumber>{100}</AnimatedNumber>);

    expect(screen.getByRole("img", { name: "100" })).toBeInTheDocument();
    expect(
      container.querySelectorAll("[data-animated-number-digit]"),
    ).toHaveLength(3);
  });
});
