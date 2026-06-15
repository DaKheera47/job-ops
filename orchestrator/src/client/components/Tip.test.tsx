import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tip } from "./Tip";

const expectTipVisible = async (text: string) => {
  expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
};

describe("Tip", () => {
  it("opens on hover and closes on mouse leave", async () => {
    render(
      <Tip content="Helpful detail">
        <span>Info</span>
      </Tip>,
    );

    const trigger = screen.getByRole("button", { name: "Info" });
    fireEvent.mouseEnter(trigger);
    await expectTipVisible("Helpful detail");

    fireEvent.mouseLeave(trigger);
    expect(screen.queryByText("Helpful detail")).not.toBeInTheDocument();
  });

  it("opens on focus and closes on blur", async () => {
    render(
      <Tip content="Keyboard detail">
        <span>Info</span>
      </Tip>,
    );

    const trigger = screen.getByRole("button", { name: "Info" });
    fireEvent.focus(trigger);
    await expectTipVisible("Keyboard detail");

    fireEvent.blur(trigger);
    expect(screen.queryByText("Keyboard detail")).not.toBeInTheDocument();
  });

  it("toggles on touch without immediately closing on the synthetic click", async () => {
    render(
      <Tip content="Touch detail">
        <span>Info</span>
      </Tip>,
    );

    const trigger = screen.getByRole("button", { name: "Info" });
    fireEvent.touchStart(trigger);
    fireEvent.click(trigger);

    await expectTipVisible("Touch detail");
  });

  it("toggles on click by default", async () => {
    render(
      <Tip content="Click detail">
        <span>Info</span>
      </Tip>,
    );

    const trigger = screen.getByRole("button", { name: "Info" });
    fireEvent.click(trigger);
    await expectTipVisible("Click detail");

    fireEvent.click(trigger);
    expect(screen.queryByText("Click detail")).not.toBeInTheDocument();
  });

  it("does not toggle on click when click behavior is disabled", () => {
    render(
      <Tip content="Click detail" clickBehavior="none">
        <span>Info</span>
      </Tip>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    expect(screen.queryByText("Click detail")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(
      <Tip content="Escape detail">
        <span>Info</span>
      </Tip>,
    );

    const trigger = screen.getByRole("button", { name: "Info" });
    fireEvent.click(trigger);
    await expectTipVisible("Escape detail");

    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByText("Escape detail")).not.toBeInTheDocument();
  });

  it("does not wrap disabled or empty tips", () => {
    const { rerender } = render(
      <Tip content={null}>
        <span>Plain</span>
      </Tip>,
    );

    expect(screen.queryByRole("button", { name: "Plain" })).toBeNull();
    expect(screen.getByText("Plain")).toBeInTheDocument();

    rerender(
      <Tip content="Hidden" disabled>
        <span>Plain</span>
      </Tip>,
    );

    expect(screen.queryByRole("button", { name: "Plain" })).toBeNull();
    expect(screen.queryByText("Hidden")).toBeNull();
  });
});
