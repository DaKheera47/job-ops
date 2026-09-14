import type { BillingStatusResponse } from "@shared/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BillingSettingsSection } from "./BillingSettingsSection";

const limits = {
  job_search: 100,
  pipeline_run: 25,
  tailoring: 250,
  ghostwriter: 250,
  pdf_export: 250,
};

const usage: BillingStatusResponse["usage"] = {
  tenantId: "tenant_default",
  userId: "alice",
  period: "2026-09",
  quotasEnabled: true,
  actions: [
    {
      action: "job_search",
      period: "2026-09",
      usedUnits: 79,
      reservedUnits: 1,
      limitUnits: 100,
      availableUnits: 20,
    },
    {
      action: "pipeline_run",
      period: "2026-09",
      usedUnits: 6,
      reservedUnits: 0,
      limitUnits: 25,
      availableUnits: 19,
    },
    {
      action: "tailoring",
      period: "2026-09",
      usedUnits: 81,
      reservedUnits: 0,
      limitUnits: 250,
      availableUnits: 169,
    },
    {
      action: "ghostwriter",
      period: "2026-09",
      usedUnits: 12,
      reservedUnits: 0,
      limitUnits: 250,
      availableUnits: 238,
    },
    {
      action: "pdf_export",
      period: "2026-09",
      usedUnits: 250,
      reservedUnits: 0,
      limitUnits: 250,
      availableUnits: 0,
    },
  ],
};

describe("BillingSettingsSection", () => {
  it("renders Free with the fixed £30 upgrade action", () => {
    const onUpgrade = vi.fn();
    render(
      <BillingSettingsSection
        status={{
          plan: "free",
          platformAiIncluded: true,
          userEditableLlmSettings: false,
          hostedLimits: limits,
          subscription: null,
          priceGbpMonthly: 30,
          usage,
        }}
        isLoading={false}
        isBusy={false}
        onUpgrade={onUpgrade}
        onManage={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Free" })).toBeVisible();
    expect(screen.getByText(/Included AI with lower/)).toBeVisible();
    expect(screen.getByText(/£30/)).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Monthly usage" }),
    ).toBeVisible();
    expect(screen.getByText("80 / 100")).toBeVisible();
    const jobSearchMeter = screen.getByRole("progressbar", {
      name: "Job-source searches usage",
    });
    expect(jobSearchMeter).toHaveAttribute("aria-valuetext", "80 of 100 used");
    expect(jobSearchMeter).toHaveClass("[&>div]:bg-amber-500");
    expect(
      screen.getByRole("progressbar", { name: "PDF exports usage" }),
    ).toHaveClass("[&>div]:bg-destructive");
    expect(screen.getAllByRole("progressbar")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it("renders active Pro with higher limits and portal action", () => {
    render(
      <BillingSettingsSection
        status={{
          plan: "pro",
          platformAiIncluded: true,
          userEditableLlmSettings: false,
          hostedLimits: { ...limits, job_search: 500 },
          subscription: {
            status: "active",
            currentPeriodEnd: 1_800_000_000,
            cancelAtPeriodEnd: false,
          },
          priceGbpMonthly: 30,
          usage,
        }}
        isLoading={false}
        isBusy={false}
        onUpgrade={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Pro" })).toBeVisible();
    expect(screen.getByText(/Included AI with higher/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Manage subscription" }),
    ).toBeVisible();
  });

  it("shows scheduled cancellation while retaining Pro", () => {
    render(
      <BillingSettingsSection
        status={{
          plan: "pro",
          platformAiIncluded: true,
          userEditableLlmSettings: false,
          hostedLimits: { ...limits, job_search: 500 },
          subscription: {
            status: "active",
            currentPeriodEnd: 1_800_000_000,
            cancelAtPeriodEnd: true,
          },
          priceGbpMonthly: 30,
          usage,
        }}
        isLoading={false}
        isBusy={false}
        onUpgrade={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Pro" })).toBeVisible();
    expect(screen.getByText(/Pro access remains active until/)).toBeVisible();
  });

  it("explains when hosted quotas are disabled", () => {
    render(
      <BillingSettingsSection
        status={{
          plan: "free",
          platformAiIncluded: true,
          userEditableLlmSettings: false,
          hostedLimits: limits,
          subscription: null,
          priceGbpMonthly: 30,
          usage: { ...usage, quotasEnabled: false, actions: [] },
        }}
        isLoading={false}
        isBusy={false}
        onUpgrade={vi.fn()}
        onManage={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Usage limits are not enabled for this workspace."),
    ).toBeVisible();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
});
