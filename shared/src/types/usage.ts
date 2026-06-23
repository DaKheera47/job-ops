export const HOSTED_USAGE_ACTIONS = [
  "job_search",
  "pipeline_run",
  "tailoring",
  "ghostwriter",
  "pdf_export",
] as const;

export type HostedUsageAction = (typeof HOSTED_USAGE_ACTIONS)[number];

export type HostedUsageReservationStatus = "reserved" | "settled" | "refunded";

export interface HostedUsageActionSummary {
  action: HostedUsageAction;
  period: string;
  usedUnits: number;
  reservedUnits: number;
  limitUnits: number;
  availableUnits: number;
}

export interface HostedUsageSummary {
  tenantId: string | null;
  userId: string | null;
  period: string;
  quotasEnabled: boolean;
  actions: HostedUsageActionSummary[];
}
