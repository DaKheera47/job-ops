type Primitive = string | number | boolean | null;

export type AnalyticsPayload = Record<string, Primitive>;

export function withAnalyticsMetadata(
  payload: AnalyticsPayload | undefined,
  metadata: {
    analyticsUserId?: string | null;
    appVersion?: string | null;
  },
): AnalyticsPayload | undefined {
  const analyticsUserId = metadata.analyticsUserId?.trim() || null;
  const appVersion = metadata.appVersion?.trim() || null;

  if (!analyticsUserId && !appVersion) {
    return payload;
  }

  return {
    ...(payload ?? {}),
    ...(analyticsUserId ? { analytics_user_id: analyticsUserId } : {}),
    ...(appVersion ? { app_version: appVersion } : {}),
  };
}
