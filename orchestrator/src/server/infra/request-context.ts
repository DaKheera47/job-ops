import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  requestId: string;
  pipelineRunId?: string;
  jobId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

export function runWithRequestContext<T>(
  context: Partial<RequestContext>,
  fn: () => T,
): T {
  const current = storage.getStore();
  const merged: RequestContext = {
    requestId: context.requestId ?? current?.requestId ?? "unknown",
    ...(current ?? {}),
    ...context,
  };
  return storage.run(merged, fn);
}

export function getRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
