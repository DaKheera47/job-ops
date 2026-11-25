import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  LanguageSelector,
  UiLanguageProvider,
  useUiTranslation,
} from "./language";

function Example() {
  const { t } = useUiTranslation();
  return (
    <>
      <LanguageSelector />
      <h1>{t("Your resume")}</h1>
      <input aria-label="Resume name" defaultValue="My original resume" />
      <p>{t("Untranslated source text")}</p>
    </>
  );
}

describe("UI language", () => {
  beforeEach(() => localStorage.clear());
  it("switches language without resetting user input and persists the choice", () => {
    render(
      <UiLanguageProvider>
        <Example />
      </UiLanguageProvider>,
    );
    fireEvent.change(screen.getByLabelText("Resume name"), {
      target: { value: "用户输入保持原样" },
    });
    fireEvent.change(screen.getByLabelText("界面语言 / Interface language"), {
      target: { value: "zh-CN" },
    });
    expect(screen.getByRole("heading")).toHaveTextContent("你的简历");
    expect(screen.getByLabelText("Resume name")).toHaveValue(
      "用户输入保持原样",
    );
    expect(localStorage.getItem("jobops.uiLanguage")).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(screen.getByText("Untranslated source text")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("界面语言 / Interface language"), {
      target: { value: "en" },
    });
    expect(screen.getByRole("heading")).toHaveTextContent("Your resume");
  });
  it("restores the saved language", () => {
    localStorage.setItem("jobops.uiLanguage", "zh-CN");
    render(
      <UiLanguageProvider>
        <Example />
      </UiLanguageProvider>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("你的简历");
  });
});
