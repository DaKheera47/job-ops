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
  window.umami?.track(event, data);
}
