import type { JobStatus, PostApplicationProvider } from "@shared/types";

export const queryKeys = {
  settings: {
    all: ["settings"] as const,
    current: () => [...queryKeys.settings.all, "current"] as const,
  },
  profile: {
    all: ["profile"] as const,
    current: () => [...queryKeys.profile.all, "current"] as const,
  },
  tracer: {
    all: ["tracer"] as const,
    readiness: (force = false) =>
      [...queryKeys.tracer.all, "readiness", { force }] as const,
    analytics: (options?: {
      from?: number;
      to?: number;
      includeBots?: boolean;
      limit?: number;
    }) => [...queryKeys.tracer.all, "analytics", options ?? {}] as const,
    jobLinks: (
      jobId: string,
      options?: { from?: number; to?: number; includeBots?: boolean },
    ) => [...queryKeys.tracer.all, "job-links", jobId, options ?? {}] as const,
  },
  demo: {
    all: ["demo"] as const,
    info: () => [...queryKeys.demo.all, "info"] as const,
  },
  jobs: {
    all: ["jobs"] as const,
    inProgressBoard: () =>
      [...queryKeys.jobs.all, "in-progress-board"] as const,
    list: (options?: { statuses?: JobStatus[]; view?: "list" | "full" }) =>
      [...queryKeys.jobs.all, "list", options ?? {}] as const,
    revision: (options?: { statuses?: JobStatus[] }) =>
      [...queryKeys.jobs.all, "revision", options ?? {}] as const,
    detail: (id: string) => [...queryKeys.jobs.all, "detail", id] as const,
    stageEvents: (id: string) =>
      [...queryKeys.jobs.all, "stage-events", id] as const,
    tasks: (id: string) => [...queryKeys.jobs.all, "tasks", id] as const,
  },
  pipeline: {
    all: ["pipeline"] as const,
    status: () => [...queryKeys.pipeline.all, "status"] as const,
  },
  visaSponsors: {
    all: ["visa-sponsors"] as const,
    status: () => [...queryKeys.visaSponsors.all, "status"] as const,
    search: (query: string, limit: number, minScore: number) =>
      [
        ...queryKeys.visaSponsors.all,
        "search",
        { query, limit, minScore },
      ] as const,
    organization: (name: string) =>
      [...queryKeys.visaSponsors.all, "organization", name] as const,
  },
  postApplication: {
    all: ["post-application"] as const,
    providerStatus: (provider: PostApplicationProvider, accountKey: string) =>
      [
        ...queryKeys.postApplication.all,
        "provider-status",
        { provider, accountKey },
      ] as const,
    inbox: (
      provider: PostApplicationProvider,
      accountKey: string,
      limit: number,
    ) =>
      [
        ...queryKeys.postApplication.all,
        "inbox",
        { provider, accountKey, limit },
      ] as const,
    runs: (
      provider: PostApplicationProvider,
      accountKey: string,
      limit: number,
    ) =>
      [
        ...queryKeys.postApplication.all,
        "runs",
        { provider, accountKey, limit },
      ] as const,
    runMessages: (
      runId: string,
      provider: PostApplicationProvider,
      accountKey: string,
    ) =>
      [
        ...queryKeys.postApplication.all,
        "run-messages",
        { runId, provider, accountKey },
      ] as const,
  },
  backups: {
    all: ["backups"] as const,
    list: () => [...queryKeys.backups.all, "list"] as const,
  },
} as const;
