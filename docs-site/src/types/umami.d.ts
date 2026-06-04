export {};

declare global {
  interface Window {
    __JOBOPS_ANALYTICS_DISABLED__?: boolean;
    umami?: {
      track: (eventName: string, payload?: Record<string, unknown>) => void;
    };
  }
}
