import * as api from "@client/api";
import { createAppSettings } from "@shared/testing/factories.js";
import type { JobSource, PipelineSearchPreset } from "@shared/types";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type React from "react";
import { useState } from "react";
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

vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
    children: React.ReactNode;
  }) => (
    <select
      aria-label="Saved searches"
      disabled={disabled}
      value={value}
      onChange={(event) => onValueChange(event.currentTarget.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

vi.mock("@/lib/user-location", () => ({
  getDetectedCountryKey: getDetectedCountryKeyMock,
}));

vi.mock("@client/api", () => ({
  planPipelineSearch: vi.fn(),
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
  const openConfigureDetails = () => {
    const trigger = screen.getByRole("tab", { name: "Configure details" });
    if (trigger.getAttribute("aria-selected") !== "true") {
      fireEvent.pointerDown(trigger);
      fireEvent.mouseDown(trigger);
      fireEvent.click(trigger);
      fireEvent.keyDown(trigger, { key: "Enter", code: "Enter" });
    }
  };

  const openLocationPreferences = () => {
    openConfigureDetails();
    const trigger = screen.getByRole("button", {
      name: "Review and edit location intent",
    });
    if (trigger.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(trigger);
    }
  };

  const openSourcePicker = () => {
    openConfigureDetails();
    const trigger = screen.getByRole("button", {
      name: "Review and edit sources",
    });
    if (trigger.getAttribute("aria-expanded") !== "true") {
      fireEvent.click(trigger);
    }
  };

  beforeEach(() => {
    getDetectedCountryKeyMock.mockReset();
    getDetectedCountryKeyMock.mockReturnValue(null);
    vi.mocked(api.planPipelineSearch).mockReset();
    ensureStorage().clear();
    Element.prototype.hasPointerCapture ??= vi.fn(() => false);
    Element.prototype.setPointerCapture ??= vi.fn();
    Element.prototype.releasePointerCapture ??= vi.fn();
  });

  it("opens with the describe search tab first", () => {
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
      screen.getByRole("tab", { name: "Describe search" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByLabelText("What do you want to search for?"),
    ).toBeInTheDocument();
  });

  it("generates search settings without starting the search", async () => {
    const onSaveAndRun = vi.fn().mockResolvedValue(undefined);
    const onSetPipelineSources = vi.fn();
    vi.mocked(api.planPipelineSearch).mockResolvedValueOnce({
      source: "ai",
      summary: "Focused the search on platform roles.",
      warnings: ["Assumed remote-friendly roles."],
      config: {
        searchTerms: ["Platform Engineer", "Backend Engineer"],
        sources: ["linkedin"],
        country: "united kingdom",
        cityLocations: ["London"],
        workplaceTypes: ["remote", "hybrid"],
        searchScope: "selected_plus_remote_worldwide",
        matchStrictness: "flexible",
        topN: 20,
        minSuitabilityScore: 40,
        runBudget: 500,
        scoringInstructions:
          "Prioritize backend platform work and remote-friendly roles.",
        automaticPresetId: "custom",
      },
    });

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
            default: "",
            override: "united kingdom",
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={onSetPipelineSources}
        isPipelineRunning={false}
        onSaveAndRun={onSaveAndRun}
      />,
    );

    fireEvent.change(screen.getByLabelText("What do you want to search for?"), {
      target: { value: "Find platform jobs in London" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Generate search settings" }),
    );

    await waitFor(() => {
      expect(api.planPipelineSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Find platform jobs in London",
          currentConfig: expect.objectContaining({
            searchTerms: ["backend engineer"],
            sources: ["linkedin"],
            scoringInstructions: "",
          }),
        }),
      );
    });
    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Configure details" }),
      ).toHaveAttribute("aria-selected", "true");
    });

    expect(onSaveAndRun).not.toHaveBeenCalled();
    expect(onSetPipelineSources).toHaveBeenCalledWith(["linkedin"]);
    expect(screen.getByText("Review generated settings")).toBeInTheDocument();
    expect(
      screen.getByText("Focused the search on platform roles."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Ranking preferences")).toHaveValue(
      "Prioritize backend platform work and remote-friendly roles.",
    );
    expect(screen.getAllByText("Platform Engineer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("London").length).toBeGreaterThan(0);
  });

  it("shows detected country as a suggestion when location settings are still defaults", () => {
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

    openConfigureDetails();

    expect(
      screen.getByRole("button", { name: "Select country" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use suggestion" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Detected from your browser/i)).toBeInTheDocument();
  });

  it("applies the browser country suggestion when requested", () => {
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

    openConfigureDetails();
    fireEvent.click(screen.getByRole("button", { name: "Use suggestion" }));

    expect(
      screen.getByRole("button", { name: "United States" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Detected from your browser/i),
    ).not.toBeInTheDocument();
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

    openConfigureDetails();

    expect(
      screen.getByRole("button", { name: "Select country" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run search" })).toBeDisabled();
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

    openConfigureDetails();

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

    openConfigureDetails();

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

    openSourcePicker();

    expect(screen.getByRole("button", { name: "Gradcracker" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "UK Visa Jobs" })).toBeDisabled();
  });

  it("disables and prunes Naukri outside India", async () => {
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
          searchCities: { value: "", default: "", override: null },
        })}
        enabledSources={["linkedin", "naukri"]}
        pipelineSources={["linkedin", "naukri"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={onSetPipelineSources}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    await waitFor(() => {
      expect(onSetPipelineSources).toHaveBeenCalledWith(["linkedin"]);
    });

    openSourcePicker();

    expect(screen.getByRole("button", { name: "Naukri" })).toBeDisabled();
  });

  it("moves a deselected source to the end of the ready list", async () => {
    const StatefulTab = () => {
      const [pipelineSources, setPipelineSources] = useState<JobSource[]>([
        "linkedin",
        "indeed",
      ]);

      return (
        <AutomaticRunTab
          open
          settings={createAppSettings({
            jobspyCountryIndeed: {
              value: "united kingdom",
              default: "united kingdom",
              override: "united kingdom",
            },
            searchCities: {
              value: "London",
              default: "",
              override: "London",
            },
          })}
          enabledSources={["linkedin", "indeed", "glassdoor"]}
          pipelineSources={pipelineSources}
          onToggleSource={(source, checked) => {
            setPipelineSources((current) =>
              checked
                ? [...current.filter((value) => value !== source), source]
                : current.filter((value) => value !== source),
            );
          }}
          onSetPipelineSources={vi.fn()}
          isPipelineRunning={false}
          onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
        />
      );
    };

    render(<StatefulTab />);

    openSourcePicker();
    fireEvent.click(screen.getByRole("button", { name: "LinkedIn" }));

    await waitFor(() => {
      expect(
        screen.getAllByRole("button", {
          name: /^(Indeed|Glassdoor|LinkedIn)$/,
        }),
      ).toHaveLength(3);
    });

    expect(
      screen
        .getAllByRole("button", {
          name: /^(Indeed|Glassdoor|LinkedIn)$/,
        })
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["Indeed", "Glassdoor", "LinkedIn"]);
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

    openSourcePicker();

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

    openSourcePicker();

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

    openSourcePicker();

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

    openConfigureDetails();
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

    openConfigureDetails();
    const input = screen.getByPlaceholderText("Type and press Enter");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Backspace" });

    expect(screen.getAllByText("backend engineer").length).toBeGreaterThan(0);
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

    openConfigureDetails();
    const collapsedTokens = screen.getByTestId(
      "city-locations-input-collapsed-tokens",
    );
    expect(within(collapsedTokens).getByText("London")).toBeInTheDocument();
    expect(within(collapsedTokens).getByText("Manchester")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove city London" }),
    ).not.toBeInTheDocument();

    fireEvent.focus(screen.getByLabelText("Cities"));
    openSourcePicker();

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

    openLocationPreferences();
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

    openConfigureDetails();
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

    openLocationPreferences();
    fireEvent.click(screen.getByLabelText("Remote"));
    fireEvent.click(screen.getByLabelText("Hybrid"));
    fireEvent.click(screen.getByLabelText("Onsite"));

    expect(
      screen.getByText("Select at least one workplace type."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run search" })).toBeDisabled();
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

    openLocationPreferences();
    fireEvent.click(screen.getByLabelText("Hybrid"));
    fireEvent.click(screen.getByLabelText("Onsite"));
    fireEvent.click(screen.getByRole("button", { name: "Run search" }));

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

    openConfigureDetails();
    fireEvent.click(screen.getByRole("button", { name: "Run settings" }));
    fireEvent.change(screen.getByLabelText("Max jobs discovered"), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Run search" }));

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

    openConfigureDetails();
    fireEvent.click(screen.getByRole("button", { name: "Balanced" }));
    fireEvent.click(screen.getByRole("button", { name: "Run search" }));

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

    openConfigureDetails();
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

    openConfigureDetails();
    fireEvent.click(screen.getByRole("button", { name: "Balanced" }));
    fireEvent.click(screen.getByRole("button", { name: "Custom" }));
    fireEvent.click(screen.getByRole("button", { name: "Run search" }));

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

    openConfigureDetails();
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

    openLocationPreferences();
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

  it("applies a saved pipeline search in one selection", async () => {
    const onSetPipelineSources = vi.fn();
    const onApplySavedSearch = vi.fn().mockResolvedValue(undefined);
    const savedSearch: PipelineSearchPreset = {
      id: "search-1",
      name: "London backend",
      createdAt: "2026-05-30T10:00:00.000Z",
      updatedAt: "2026-05-30T10:00:00.000Z",
      lastUsedAt: null,
      config: {
        searchTerms: ["backend engineer"],
        sources: ["linkedin", "glassdoor"],
        country: "united kingdom",
        cityLocations: ["London"],
        workplaceTypes: ["remote"],
        searchScope: "selected_only",
        matchStrictness: "exact_only",
        topN: 5,
        minSuitabilityScore: 75,
        runBudget: 300,
        automaticPresetId: "fast",
      },
    };

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
          searchTerms: {
            value: ["frontend engineer"],
            default: ["frontend engineer"],
            override: null,
          },
        })}
        enabledSources={["linkedin", "glassdoor"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={onSetPipelineSources}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
        savedSearches={[savedSearch]}
        onApplySavedSearch={onApplySavedSearch}
      />,
    );

    openConfigureDetails();
    fireEvent.change(screen.getByRole("combobox", { name: "Saved searches" }), {
      target: { value: "search-1" },
    });

    expect(
      screen.getByRole("button", { name: "United Kingdom" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("backend engineer").length).toBeGreaterThan(0);
    expect(screen.getAllByText("London").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Fast" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(onSetPipelineSources).toHaveBeenCalledWith([
      "linkedin",
      "glassdoor",
    ]);
    expect(onApplySavedSearch).toHaveBeenCalledWith(savedSearch);
  });

  it("saves the current pipeline search state", async () => {
    const onCreateSavedSearch = vi.fn().mockResolvedValue({
      id: "created-search",
      name: "Croatia frontend",
    });

    render(
      <AutomaticRunTab
        open
        settings={createAppSettings({
          jobspyCountryIndeed: {
            value: "croatia",
            default: "",
            override: "croatia",
          },
          searchTerms: {
            value: ["frontend engineer"],
            default: ["frontend engineer"],
            override: null,
          },
          workplaceTypes: {
            value: ["remote"],
            default: ["remote", "hybrid", "onsite"],
            override: ["remote"],
          },
        })}
        enabledSources={["linkedin"]}
        pipelineSources={["linkedin"]}
        onToggleSource={vi.fn()}
        onSetPipelineSources={vi.fn()}
        isPipelineRunning={false}
        onSaveAndRun={vi.fn().mockResolvedValue(undefined)}
        onCreateSavedSearch={onCreateSavedSearch}
      />,
    );

    openConfigureDetails();
    fireEvent.click(screen.getByRole("button", { name: "Save as" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Croatia frontend" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(onCreateSavedSearch).toHaveBeenCalledWith({
        name: "Croatia frontend",
        config: expect.objectContaining({
          country: "croatia",
          searchTerms: ["frontend engineer"],
          sources: ["linkedin"],
          workplaceTypes: ["remote"],
        }),
      });
    });
  });
});
