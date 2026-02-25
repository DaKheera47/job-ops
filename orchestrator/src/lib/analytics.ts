type UmamiTracker = {
  track: (event: string, data?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export function trackEvent(event: string, data?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  const analyticsUserId = getAnalyticsUserId();
  const payload =
    analyticsUserId === null
      ? data
      : {
          ...(data ?? {}),
          analytics_user_id: analyticsUserId,
        };
  window.umami?.track(event, payload);
}

type ProductEventMap = {
  jobs_pipeline_run_started: {
    mode: string;
    source_count?: number;
    top_n?: number;
    min_suitability_score?: number;
    country?: string;
    has_city_locations?: boolean;
    search_terms_count?: number;
  };
  jobs_pipeline_run_cancel_requested: {
    was_running: boolean;
  };
  jobs_pipeline_run_finished: {
    status: "completed" | "failed" | "cancelled";
    had_error_message: boolean;
  };
  jobs_bulk_action_started: {
    action: string;
    selected_count: number;
    tab: string;
  };
  jobs_bulk_action_completed: {
    action: string;
    requested: number;
    succeeded: number;
    failed: number;
    tab: string;
  };
  jobs_job_action_completed: {
    action: string;
    result: "success" | "error";
    from_status?: string;
    to_status?: string;
  };
  jobs_command_bar_job_selected: {
    had_status_lock: boolean;
    status_lock: string;
    result_group: string;
    query_length_bucket: string;
  };
  tracking_inbox_connect_started: {
    provider: string;
    account_key_is_default: boolean;
  };
  tracking_inbox_connect_completed: {
    provider: string;
    result: "success" | "error" | "cancelled" | "timeout";
  };
  tracking_inbox_sync_started: {
    provider: string;
    max_messages: number;
    search_days: number;
  };
  tracking_inbox_sync_completed: {
    provider: string;
    result: "success" | "error";
  };
  tracking_inbox_disconnect_confirmed: {
    provider: string;
  };
  tracking_inbox_review_action_completed: {
    action: "approve" | "deny";
    context: "main_inbox" | "run_modal";
    item_count: number;
    provider: string;
    result: "success" | "error";
  };
  tracer_filters_applied: {
    include_bots: boolean;
    has_from: boolean;
    has_to: boolean;
    date_range_days_bucket: string;
  };
  tracer_drilldown_opened: {
    rank: number;
    human_clicks_bucket: string;
    total_clicks_bucket: string;
  };
  tracer_drilldown_mode_changed: {
    mode: "human" | "all";
  };
  tracer_destination_copied: {
    drilldown_mode: "human" | "all";
    is_active_link: boolean;
  };
  tracer_external_link_opened: {
    origin: "top_links" | "drilldown";
    drilldown_mode: "human" | "all";
  };
  visa_sponsor_search: {
    query_length_bucket: string;
    limit?: number;
    min_score?: number;
  };
};

type ProductEventName = keyof ProductEventMap;
type Primitive = string | number | boolean | null;
type SanitizedPayload = Record<string, Primitive>;

function generateAnalyticsUserId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `anon_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function getAnalyticsUserId(): string | null {
  if (typeof window === "undefined") return null;
  if (cachedAnalyticsUserId) return cachedAnalyticsUserId;

  try {
    const existing = window.localStorage.getItem(ANALYTICS_USER_ID_STORAGE_KEY);
    if (existing) {
      cachedAnalyticsUserId = existing;
      return existing;
    }

    const next = generateAnalyticsUserId();
    window.localStorage.setItem(ANALYTICS_USER_ID_STORAGE_KEY, next);
    cachedAnalyticsUserId = next;
    return next;
  } catch {
    return null;
  }
}

const DEDUPE_WINDOW_MS = 3_000;
const ANALYTICS_USER_ID_STORAGE_KEY = "jobops.analytics.user_id.v1";
const recentEventCache = new Map<string, number>();
let cachedAnalyticsUserId: string | null = null;
const DISALLOWED_KEY_PARTS = [
  "query",
  "url",
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "code",
] as const;

function sanitizeEventPayload(
  data: Record<string, unknown> | undefined,
): SanitizedPayload | undefined {
  if (!data) return undefined;
  const sanitized: SanitizedPayload = {};
  for (const [key, value] of Object.entries(data)) {
    const loweredKey = key.toLowerCase();
    if (DISALLOWED_KEY_PARTS.some((part) => loweredKey.includes(part))) {
      continue;
    }
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function stableStringify(value: Record<string, Primitive> | undefined): string {
  if (!value) return "";
  const orderedKeys = Object.keys(value).sort();
  const ordered: Record<string, Primitive> = {};
  for (const key of orderedKeys) {
    ordered[key] = value[key];
  }
  return JSON.stringify(ordered);
}

function shouldDedupe(
  event: string,
  data: SanitizedPayload | undefined,
): boolean {
  const now = Date.now();
  const cacheKey = `${event}:${stableStringify(data)}`;
  const lastSeenAt = recentEventCache.get(cacheKey);
  recentEventCache.set(cacheKey, now);

  for (const [key, timestamp] of recentEventCache.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS) {
      recentEventCache.delete(key);
    }
  }

  return typeof lastSeenAt === "number" && now - lastSeenAt < DEDUPE_WINDOW_MS;
}

export function trackProductEvent<T extends ProductEventName>(
  event: T,
  data: ProductEventMap[T],
) {
  const sanitized = sanitizeEventPayload(data as Record<string, unknown>);
  if (shouldDedupe(event, sanitized)) return;
  trackEvent(event, sanitized);
}

export function bucketCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value === 1) return "1";
  if (value <= 5) return "2_5";
  if (value <= 20) return "6_20";
  if (value <= 100) return "21_100";
  return "101_plus";
}

export function bucketClicks(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value === 1) return "1";
  if (value <= 5) return "2_5";
  if (value <= 20) return "6_20";
  if (value <= 50) return "21_50";
  return "51_plus";
}

export function bucketQueryLength(value: string | number): string {
  const length =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? value.length
        : 0;
  if (!Number.isFinite(length) || length <= 0) return "0";
  if (length <= 3) return "1_3";
  if (length <= 10) return "4_10";
  if (length <= 30) return "11_30";
  if (length <= 100) return "31_100";
  return "101_plus";
}

export function __resetAnalyticsTestState() {
  recentEventCache.clear();
  cachedAnalyticsUserId = null;
}
