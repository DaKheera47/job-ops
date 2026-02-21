import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { parseCityLocationsInput } from "./automatic-run";
import { TokenizedInput } from "./TokenizedInput";

function buildClipboardData(text: string): DataTransfer {
  return {
    getData: (type: string) => (type === "text" ? text : ""),
  } as DataTransfer;
}

function renderCityInput() {
  let values: string[] = [];
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
  it("tokenizes single-value paste and clears draft", () => {
    const { getInput } = renderCityInput();
    const input = getInput();

    fireEvent.change(input, { target: { value: "foo" } });
    fireEvent.paste(input, {
      clipboardData: buildClipboardData("Leeds"),
    });

    expect(input.value).toBe("");
    expect(screen.getByText("Currently selected: Leeds")).toBeInTheDocument();
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
});
