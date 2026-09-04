import type { BillingStatusResponse } from "@shared/types";
import { fetchApi } from "./core";

export async function getBillingStatus(): Promise<BillingStatusResponse> {
  return fetchApi<BillingStatusResponse>("/billing/status");
}

export async function createBillingCheckout(): Promise<{ url: string }> {
  return fetchApi<{ url: string }>("/billing/checkout", { method: "POST" });
}

export async function createBillingPortal(): Promise<{ url: string }> {
  return fetchApi<{ url: string }>("/billing/portal", { method: "POST" });
}
