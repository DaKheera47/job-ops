import { createAppSettings } from "@shared/testing/factories.js";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutomaticRunTab } from "./AutomaticRunTab";
import { AUTOMATIC_PRESETS, RUN_MEMORY_STORAGE_KEY } from "./automatic-run";

const { getDetectedCountryKeyMock } = vi.hoisted(() => ({
  getDetectedCountryKeyMock: vi.fn((): string | null => null),
}));

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/lib/user-location", () => ({
  getDetectedCountryKey: getDetectedCountryKeyMock,
}));

function ensureStorage(): Storage {
  const existing = globalThis.localStorage as Partial<Storage> | undefined;
  const hasStorageShape =
    existing &&
    typeof existing.getItem === "function" &&
    typeof existing.setItem === "function" &&
    typeof existing.removeItem === "function" &&
    typeof existing.clear === "function";

  if (hasStorageShape) {
    return existing as Storage;
  }

  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      const value = store.get(key);
      return value ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });

  return storage;
}

describe("AutomaticRunTab", () => {
  beforeEach(() => {
    getDetectedCountryKeyMock.mockReset();
    getDetectedCountryKeyMock.mockReturnValue(null);
    ensureStorage().clear();
  });

  it("uses detected country when location settings are still defaults", () => {
    getDetectedCountryKeyMock.mockReturnValueOnce("united states");

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings()}
        enabledSources={["linkedin", "gradcracker", "ukvisajobs"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByRole("button", { name: "United States" }),
    ).toBeInTheDocument();
  });

  it("does not default the country picker to United Kingdom", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings()}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Select country" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start run now" }),
    ).toBeDisabled();
  });

  it("loads persisted country from settings", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: {
            value: ["backend engineer"],
            default: ["backend engineer"],
            override: null,
          },
          jobspyCountryIndeed: {
            value: "us",
            default: "united kingdom",
            override: "us",
          },
          searchCities: { value: "", default: "", override: null },
        })}
        enabledSources={["linkedin", "gradcracker", "ukvisajobs"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByRole("button", { name: "United States" }),
    ).toBeInTheDocument();
  });

  it("maps legacy usa/ca country to United States in the picker", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: {
            value: ["backend engineer"],
            default: ["backend engineer"],
            override: null,
          },
          jobspyCountryIndeed: {
            value: "usa/ca",
            default: "united kingdom",
            override: "usa/ca",
          },
          searchCities: { value: "", default: "", override: null },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByRole("button", { name: "United States" }),
    ).toBeInTheDocument();
  });

  it("disables and prunes UK-only sources for non-UK country", async () => {
    const onSetPipelineSources = vi.fn();

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: {
            value: ["backend engineer"],
            default: ["backend engineer"],
            override: null,
          },
          jobspyCountryIndeed: {
            value: "united states",
            default: "united kingdom",
            override: "united states",
          },
          searchCities: { value: "", default: "", override: null },
        })}
        enabledSources={["linkedin", "gradcracker", "ukvisajobs"]}
        pipelineSources={["linkedin", "gradcracker", "ukvisajobs"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={onSetPipelineSources}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(onSetPipelineSources).toHaveBeenCalledWith(["linkedin"]);
    });

    expect(screen.getByRole("button", { name: "Gradcracker" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "UK Visa Jobs" })).toBeDisabled();
  });

  it("shows disabled source guidance copy for UK-only source", async () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: {
            value: ["backend engineer"],
            default: ["backend engineer"],
            override: null,
          },
          jobspyCountryIndeed: {
            value: "united states",
            default: "united kingdom",
            override: "united states",
          },
          searchCities: { value: "", default: "", override: null },
        })}
        enabledSources={["linkedin", "gradcracker", "ukvisajobs"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByTitle(
        "Gradcracker is available only when country is United Kingdom.",
      ),
    ).toBeInTheDocument();
  });

  it("disables glassdoor for unsupported countries with guidance copy", async () => {
    const onSetPipelineSources = vi.fn();

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: {
            value: ["backend engineer"],
            default: ["backend engineer"],
            override: null,
          },
          jobspyCountryIndeed: {
            value: "japan",
            default: "united kingdom",
            override: "japan",
          },
          searchCities: { value: "", default: "", override: null },
        })}
        enabledSources={["linkedin", "glassdoor"]}
        pipelineSources={["linkedin", "glassdoor"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={onSetPipelineSources}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(onSetPipelineSources).toHaveBeenCalledWith(["linkedin"]);
    });

    const glassdoorButton = screen.getByRole("button", { name: "Glassdoor" });
    expect(glassdoorButton).toBeDisabled();
    expect(glassdoorButton.getAttribute("title")).toContain(
      "Glassdoor is not available for the selected country.",
    );
  });

  it("disables glassdoor for supported countries until city is provided", async () => {
    const onSetPipelineSources = vi.fn();

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: {
            value: ["backend engineer"],
            default: ["backend engineer"],
            override: null,
          },
          jobspyCountryIndeed: {
            value: "united kingdom",
            default: "united kingdom",
            override: "united kingdom",
          },
          searchCities: {
            value: "United Kingdom",
            default: "United Kingdom",
            override: "United Kingdom",
          },
        })}
        enabledSources={["linkedin", "glassdoor"]}
        pipelineSources={["linkedin", "glassdoor"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={onSetPipelineSources}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(onSetPipelineSources).toHaveBeenCalledWith(["linkedin"]);
    });

    const glassdoorButton = screen.getByRole("button", { name: "Glassdoor" });
    expect(glassdoorButton).toBeDisabled();
    expect(glassdoorButton.getAttribute("title")).toContain(
      "Add at least one city in Location preferences to enable Glassdoor.",
    );
  });

  it("does not show legacy country-only city defaults as selected cities", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "united kingdom",
            default: "united kingdom",
            override: "united kingdom",
          },
          searchCities: {
            value: "UK",
            default: "UK",
            override: "UK",
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.focus(screen.getByLabelText("Cities"));

    expect(
      screen.queryByRole("button", { name: /Remove city/i }),
    ).not.toBeInTheDocument();
  });

  it("does not remove existing search terms when Backspace is pressed on an empty input", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: {
            value: ["backend engineer", "frontend engineer"],
            default: ["backend engineer", "frontend engineer"],
            override: null,
          },
          jobspyCountryIndeed: {
            value: "united kingdom",
            default: "united kingdom",
            override: "united kingdom",
          },
          searchCities: { value: "", default: "", override: null },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const input = screen.getByPlaceholderText("Type and press Enter");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(
      screen.getByRole("button", { name: "Remove backend engineer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove frontend engineer" }),
    ).toBeInTheDocument();
  });

  it("loads multiple saved cities and keeps glassdoor enabled", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          searchTerms: {
            value: ["backend engineer"],
            default: ["backend engineer"],
            override: null,
          },
          jobspyCountryIndeed: {
            value: "united kingdom",
            default: "united kingdom",
            override: "united kingdom",
          },
          searchCities: {
            value: "London|Manchester",
            default: "London|Manchester",
            override: "London|Manchester",
          },
        })}
        enabledSources={["linkedin", "glassdoor"]}
        pipelineSources={["linkedin", "glassdoor"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    const collapsedTokens = screen.getByTestId(
      "city-locations-input-collapsed-tokens",
    );
    expect(within(collapsedTokens).getByText("London")).toBeInTheDocument();
    expect(within(collapsedTokens).getByText("Manchester")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove city London" }),
    ).not.toBeInTheDocument();

    fireEvent.focus(screen.getByLabelText("Cities"));

    expect(
      screen.getByRole("button", { name: "Remove city London" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove city Manchester" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Glassdoor" })).toBeEnabled();
  });

  it("loads saved workplace types from settings", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          workplaceTypes: {
            value: ["remote", "onsite"],
            default: ["remote", "hybrid", "onsite"],
            override: ["remote", "onsite"],
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByLabelText("Remote")).toBeChecked();
    expect(screen.getByLabelText("Onsite")).toBeChecked();
    expect(screen.getByLabelText("Hybrid")).not.toBeChecked();
  });

  it("normalizes saved max jobs discovered values below 50 in the UI", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
          jobspyResultsWanted: {
            value: 25,
            default: 200,
            override: 25,
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run settings" }));

    expect(screen.getByLabelText("Max jobs discovered")).toHaveValue(50);
  });

  it("requires at least one workplace type", async () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    fireEvent.click(screen.getByLabelText("Remote"));
    fireEvent.click(screen.getByLabelText("Hybrid"));
    fireEvent.click(screen.getByLabelText("Onsite"));

    expect(
      screen.getByText("Select at least one workplace type."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start run now" }),
    ).toBeDisabled();
  });

  it("keeps source-specific warnings out of the location section", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          workplaceTypes: {
            value: ["remote", "hybrid"],
            default: ["remote", "hybrid", "onsite"],
            override: ["remote", "hybrid"],
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.queryByText(
        /Some sources can only apply a strict remote filter\./i,
      ),
    ).not.toBeInTheDocument();
  });

  it("submits workplace types in onSaveAndRun values", async () => {
    const onSaveAndRun = vi.fn().mockResolvedValue(undefined);

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={onSaveAndRun}
      />,
    );

    fireEvent.click(screen.getByLabelText("Hybrid"));
    fireEvent.click(screen.getByLabelText("Onsite"));
    fireEvent.click(screen.getByRole("button", { name: "Start run now" }));

    await waitFor(() => {
      expect(onSaveAndRun).toHaveBeenCalledWith(
        expect.objectContaining({
          workplaceTypes: ["remote"],
        }),
      );
    });
  });

  it("clamps max jobs discovered to 50 before submitting", async () => {
    const onSaveAndRun = vi.fn().mockResolvedValue(undefined);

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={onSaveAndRun}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run settings" }));
    fireEvent.change(screen.getByLabelText("Max jobs discovered"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start run now" }));

    await waitFor(() => {
      expect(onSaveAndRun).toHaveBeenCalledWith(
        expect.objectContaining({
          runBudget: 50,
        }),
      );
    });
  });

  it("remembers the balanced preset and its budget across reopen", async () => {
    const onSaveAndRun = vi.fn().mockResolvedValue(undefined);

    const { unmount } = render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
          jobspyResultsWanted: {
            value: 80,
            default: 20,
            override: 80,
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={onSaveAndRun}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Balanced" }));
    fireEvent.click(screen.getByRole("button", { name: "Start run now" }));

    await waitFor(() => {
      expect(onSaveAndRun).toHaveBeenCalled();
    });

    expect(
      JSON.parse(localStorage.getItem(RUN_MEMORY_STORAGE_KEY) ?? "{}"),
    ).toEqual(
      expect.objectContaining({
        presetId: "balanced",
        runBudget: AUTOMATIC_PRESETS.balanced.runBudget,
      }),
    );

    unmount();

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
          jobspyResultsWanted: {
            value: 90,
            default: 20,
            override: 90,
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Balanced" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Run settings" }));

    expect(screen.getByLabelText("Max jobs discovered")).toHaveValue(
      AUTOMATIC_PRESETS.balanced.runBudget,
    );
  });

  it("remembers custom mode even when the values match Balanced", async () => {
    const onSaveAndRun = vi.fn().mockResolvedValue(undefined);

    const { unmount } = render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
          jobspyResultsWanted: {
            value: 80,
            default: 20,
            override: 80,
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={onSaveAndRun}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Balanced" }));
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.click(screen.getByRole("button", { name: "Start run now" }));

    await waitFor(() => {
      expect(onSaveAndRun).toHaveBeenCalled();
    });

    expect(
      JSON.parse(localStorage.getItem(RUN_MEMORY_STORAGE_KEY) ?? "{}"),
    ).toEqual(
      expect.objectContaining({
        presetId: "custom",
        runBudget: AUTOMATIC_PRESETS.balanced.runBudget,
      }),
    );

    unmount();

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
          jobspyResultsWanted: {
            value: 90,
            default: 20,
            override: 90,
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "Run settings" }));

    expect(screen.getByLabelText("Max jobs discovered")).toHaveValue(
      AUTOMATIC_PRESETS.balanced.runBudget,
    );
  });

  it("shows the new location preference controls and a live summary", () => {
    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
          locationSearchScope: {
            value: "selected_plus_remote_worldwide",
            default: "selected_only",
            override: "selected_plus_remote_worldwide",
          },
          locationMatchStrictness: {
            value: "flexible",
            default: "exact_only",
            override: "flexible",
          },
          searchCities: {
            value: "Zagreb",
            default: "",
            override: "Zagreb",
          },
          workplaceTypes: {
            value: ["remote", "hybrid", "onsite"],
            default: ["remote", "hybrid", "onsite"],
            override: ["remote", "hybrid", "onsite"],
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByText("Work arrangement")).toBeInTheDocument();
    expect(screen.getByText("Location scope")).toBeInTheDocument();
    expect(screen.getByText("Match strictness")).toBeInTheDocument();
    expect(
      screen.getByText("Selected locations + remote worldwide"),
    ).toBeInTheDocument();
    expect(screen.getByText("Include likely matches")).toBeInTheDocument();
    expect(
      screen.getByText(
        /You'll get (hybrid and onsite|onsite and hybrid) jobs in Zagreb in Croatia plus remote jobs worldwide\. Likely matches are included\./i,
      ),
    ).toBeInTheDocument();
  });
});
