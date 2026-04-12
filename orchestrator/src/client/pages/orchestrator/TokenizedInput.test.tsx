import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseCityLocationsInput } from "./automatic-run";
import { TokenizedInput } from "./TokenizedInput";

function buildClipboardData(text: string): DataTransfer {
  return {
    getData: (type: string) => (type === "text" ? text : ""),
  } as DataTransfer;
}

function renderCityInput(initialValues: string[] = []) {
  let values: string[] = [...initialValues];
  let draft = "";

  const setValues = (next: string[]) => {
    values = next;
    rerenderInput();
  };
  const setDraft = (next: string) => {
    draft = next;
    rerenderInput();
  };

  const renderInput = () => (
    <TokenizedInput
      id="cities"
      values={values}
      draft={draft}
      parseInput={parseCityLocationsInput}
      onDraftChange={setDraft}
      onValuesChange={setValues}
      placeholder='e.g. "London"'
      helperText="City helper"
      removeLabelPrefix="Remove city"
    />
  );

  const { rerender } = render(renderInput());

  const rerenderInput = () => {
    rerender(renderInput());
  };

  return {
    getInput: () =>
      screen.getByPlaceholderText('e.g. "London"') as HTMLInputElement,
  };
}

describe("TokenizedInput", () => {
  it("shows collapsed pills without remove buttons after tokenizing a single value", () => {
    const { getInput } = renderCityInput();
    const input = getInput();

    fireEvent.change(input, { target: { value: "foo" } });
    fireEvent.paste(input, {
      clipboardData: buildClipboardData("Leeds"),
    });

    expect(input.value).toBe("");
    const collapsedTokens = screen.getByTestId("cities-collapsed-tokens");
    expect(within(collapsedTokens).getByText("Leeds")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove city Leeds" }),
    ).not.toBeInTheDocument();
  });

  it("tokenizes multi-value paste and removes duplicates", () => {
    const { getInput } = renderCityInput();
    const input = getInput();

    fireEvent.paste(input, {
      clipboardData: buildClipboardData("Leeds, London, leeds"),
    });
    fireEvent.focus(input);

    expect(input.value).toBe("");
    expect(
      screen.getByRole("button", { name: "Remove city Leeds" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove city London" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove city leeds" }),
    ).not.toBeInTheDocument();
  });

  it("shows a collapsed overflow pill when more than five values are selected", () => {
    renderCityInput([
      "Leeds",
      "London",
      "Manchester",
      "Bristol",
      "Liverpool",
      "York",
    ]);

    const collapsedTokens = screen.getByTestId("cities-collapsed-tokens");
    expect(within(collapsedTokens).getByText("Leeds")).toBeInTheDocument();
    expect(within(collapsedTokens).getByText("Liverpool")).toBeInTheDocument();
    expect(within(collapsedTokens).getByText("+1 more")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove city York" }),
    ).not.toBeInTheDocument();
  });

  it("shows removable pills only when the input is focused", () => {
    const { getInput } = renderCityInput(["Leeds", "London"]);
    const input = getInput();

    expect(
      screen.queryByRole("button", { name: "Remove city Leeds" }),
    ).not.toBeInTheDocument();

    fireEvent.focus(input);

    expect(
      screen.getByRole("button", { name: "Remove city Leeds" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove city London" }),
    ).toBeInTheDocument();
  });
});
