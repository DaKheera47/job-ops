export interface ApiMeta {
  requestId: string;
  simulated?: boolean;
  blockedReason?: string;
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> =
  | {
      ok: true;
      data: T;
      meta?: ApiMeta;
    }
  | {
      ok: false;
      error: ApiErrorPayload;
      meta: ApiMeta;
    };

export interface TracerAnalyticsTimeseriesPoint {
  day: string; // YYYY-MM-DD
  clicks: number;
  uniqueOpens: number;
  botClicks: number;
  humanClicks: number;
}

export interface TracerAnalyticsTopJob {
  jobId: string;
  title: string;
  employer: string;
  clicks: number;
  uniqueOpens: number;
  botClicks: number;
  humanClicks: number;
  lastClickedAt: number | null;
}

export interface TracerAnalyticsTopLink {
  tracerLinkId: string;
  token: string;
  jobId: string;
  title: string;
  employer: string;
  sourcePath: string;
  sourceLabel: string;
  destinationUrl: string;
  clicks: number;
  uniqueOpens: number;
  botClicks: number;
  humanClicks: number;
  lastClickedAt: number | null;
}

export interface TracerAnalyticsResponse {
  filters: {
    jobId: string | null;
    from: number | null;
    to: number | null;
    includeBots: boolean;
    limit: number;
  };
  totals: {
    clicks: number;
    uniqueOpens: number;
    botClicks: number;
    humanClicks: number;
  };
  timeSeries: TracerAnalyticsTimeseriesPoint[];
  topJobs: TracerAnalyticsTopJob[];
  topLinks: TracerAnalyticsTopLink[];
}

export interface JobTracerLinkAnalyticsItem {
  tracerLinkId: string;
  token: string;
  sourcePath: string;
  sourceLabel: string;
  destinationUrl: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  clicks: number;
  uniqueOpens: number;
  botClicks: number;
  humanClicks: number;
  lastClickedAt: number | null;
}

export interface JobTracerLinksResponse {
  job: {
    id: string;
    title: string;
    employer: string;
    tracerLinksEnabled: boolean;
  };
  totals: {
    links: number;
    clicks: number;
    uniqueOpens: number;
    botClicks: number;
    humanClicks: number;
  };
  links: JobTracerLinkAnalyticsItem[];
}

export type TracerReadinessStatus = "ready" | "unconfigured" | "unavailable";

export interface TracerReadinessResponse {
  status: TracerReadinessStatus;
  canEnable: boolean;
  publicBaseUrl: string | null;
  healthUrl: string | null;
  checkedAt: number;
  lastSuccessAt: number | null;
  reason: string | null;
}
