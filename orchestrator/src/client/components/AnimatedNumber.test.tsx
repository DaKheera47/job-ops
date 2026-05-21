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
});
