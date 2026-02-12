import type { JobStatus } from "@shared/types.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Accordion } from "@/components/ui/accordion";
import { DangerZoneSection } from "./DangerZoneSection";

const DangerZoneHarness = ({
  initialStatuses = [] as JobStatus[],
  onClear,
}: {
  initialStatuses?: JobStatus[];
  onClear?: () => void;
}) => {
  const [statusesToClear, setStatusesToClear] =
    useState<JobStatus[]>(initialStatuses);

  const toggleStatusToClear = (status: JobStatus) => {
    setStatusesToClear((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  };

  return (
    <Accordion type="multiple" defaultValue={["danger-zone"]}>
      <DangerZoneSection
        statusesToClear={statusesToClear}
        toggleStatusToClear={toggleStatusToClear}
        handleClearByStatuses={onClear ?? (() => {})}
        handleClearDatabase={() => {}}
        isLoading={false}
        isSaving={false}
      />
    </Accordion>
  );
};

describe("DangerZoneSection", () => {
  it("disables clear when no statuses are selected", () => {
    render(<DangerZoneHarness initialStatuses={[]} />);

    const clearButton = screen.getByRole("button", { name: /clear selected/i });
    expect(clearButton).toBeDisabled();
  });

  it("toggles status selection and confirms clear", async () => {
    const onClear = vi.fn();
    render(
      <DangerZoneHarness initialStatuses={["applied"]} onClear={onClear} />,
    );

    const appliedButton = screen.getByRole("button", { name: /^applied\b/i });
    const clearButton = screen.getByRole("button", { name: /clear selected/i });

    expect(clearButton).toBeEnabled();

    fireEvent.click(clearButton);
    const confirmButton = await screen.findByRole("button", {
      name: /clear 1 status/i,
    });
    fireEvent.click(confirmButton);

    expect(onClear).toHaveBeenCalledTimes(1);

    fireEvent.click(appliedButton);
    expect(clearButton).toBeDisabled();
  });
});
