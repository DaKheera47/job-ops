import { createJob } from "@shared/testing/factories.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExportJobsCsvMenu } from "./ExportJobsCsvMenu";

const NativeURL = URL;
let blobs: Blob[];
let downloads: string[];

beforeEach(() => {
  blobs = [];
  downloads = [];
  vi.stubGlobal(
    "URL",
    class extends NativeURL {
      static createObjectURL = vi.fn((blob: Blob) => {
        blobs.push(blob);
        return "blob:csv-export";
      });
      static revokeObjectURL = vi.fn();
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function downloadedCsv(): Promise<string> {
  expect(blobs).toHaveLength(1);
  expect(blobs[0].type).toBe("text/csv;charset=utf-8");
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blobs[0]);
  });
  expect([...new Uint8Array(bytes).slice(0, 3)]).toEqual([239, 187, 191]);
  return new TextDecoder().decode(bytes);
}

function openMenu() {
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Export jobs as CSV" }),
    { key: "ArrowDown", code: "ArrowDown" },
  );
}

describe("CSV export scope", () => {
  it("downloads every filtered row in order, including rows outside a virtualized viewport", async () => {
    const jobs = Array.from({ length: 50 }, (_, i) =>
      createJob({ id: `filtered-${i}`, title: `Position ${i}` }),
    );
    render(<ExportJobsCsvMenu jobs={jobs} selectedJobIds={new Set()} />);
    openMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Filtered jobs (50)" }),
    );
    const csv = await downloadedCsv();
    expect(csv.split("\r\n")).toHaveLength(52);
    expect(csv).toContain('"filtered-49"');
    expect(csv.indexOf('"filtered-0"')).toBeLessThan(
      csv.indexOf('"filtered-49"'),
    );
    expect(downloads[0]).toMatch(
      /^jobops-jobs-\d{4}-\d{2}-\d{2}-filtered\.csv$/,
    );
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("exports only selected IDs still present in the filtered view", async () => {
    render(
      <ExportJobsCsvMenu
        jobs={[createJob({ id: "visible-a" }), createJob({ id: "visible-b" })]}
        selectedJobIds={new Set(["visible-b", "hidden-job"])}
      />,
    );
    openMenu();
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Selected jobs (1)" }),
    );
    const csv = await downloadedCsv();
    expect(csv).toContain('"visible-b"');
    expect(csv).not.toContain('"visible-a"');
    expect(csv).not.toContain("hidden-job");
    expect(downloads[0]).toMatch(/-selected\.csv$/);
  });

  it("uses the current account dataset after props change instead of retaining prior rows", async () => {
    const { rerender } = render(
      <ExportJobsCsvMenu
        jobs={[
          createJob({
            id: "old-account",
            employer: "Old account private employer",
          }),
        ]}
        selectedJobIds={new Set(["old-account"])}
      />,
    );
    rerender(
      <ExportJobsCsvMenu
        jobs={[
          createJob({
            id: "new-account",
            employer: "Current account employer",
          }),
        ]}
        selectedJobIds={new Set(["old-account"])}
      />,
    );
    openMenu();
    expect(
      screen.getByRole("menuitem", { name: "Selected jobs (0)" }),
    ).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Filtered jobs (1)" }),
    );
    const csv = await downloadedCsv();
    expect(csv).toContain("Current account employer");
    expect(csv).not.toContain("Old account private employer");
  });

  it("disables download for empty or refreshing lists", () => {
    const { rerender } = render(
      <ExportJobsCsvMenu jobs={[]} selectedJobIds={new Set()} />,
    );
    expect(
      screen.getByRole("button", { name: "Export jobs as CSV" }),
    ).toBeDisabled();
    rerender(
      <ExportJobsCsvMenu
        jobs={[createJob()]}
        selectedJobIds={new Set()}
        disabled
      />,
    );
    expect(
      screen.getByRole("button", { name: "Export jobs as CSV" }),
    ).toBeDisabled();
    expect(blobs).toEqual([]);
  });
});
