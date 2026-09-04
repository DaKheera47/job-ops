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

const usage = {
  tenantId: "tenant_default",
  userId: "alice",
  period: "2026-09",
  quotasEnabled: true,
  actions: [],
};

describe("BillingSettingsSection", () => {
  it("renders Free with the fixed £30 upgrade action", () => {
    const onUpgrade = vi.fn();
    render(
      <BillingSettingsSection
        status={{
          plan: "free",
          platformAiIncluded: false,
          userEditableLlmSettings: true,
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
    expect(screen.getByText(/£30/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Upgrade to Pro" }));
    expect(onUpgrade).toHaveBeenCalledOnce();
  });

  it("renders active Pro with included AI and portal action", () => {
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
    expect(screen.getByText(/JobOps-funded AI/)).toBeVisible();
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
});
