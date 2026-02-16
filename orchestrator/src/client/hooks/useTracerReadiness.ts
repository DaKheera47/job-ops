import type { TracerReadinessResponse } from "@shared/types";
import { useEffect, useState } from "react";
import * as api from "../api";

let readinessCache: TracerReadinessResponse | null = null;
let readinessError: Error | null = null;
let isFetching = false;
const subscribers: Set<
  (
    readiness: TracerReadinessResponse | null,
    error: Error | null,
    loading: boolean,
  ) => void
> = new Set();

function notifySubscribers(
  readiness: TracerReadinessResponse | null,
  error: Error | null,
  loading: boolean,
) {
  for (const subscriber of subscribers) {
    subscriber(readiness, error, loading);
  }
}

async function runReadinessFetch(
  force: boolean,
): Promise<TracerReadinessResponse> {
  isFetching = true;
  readinessError = null;
  notifySubscribers(readinessCache, null, true);

  try {
    const data = await api.getTracerReadiness({ force });
    readinessCache = data;
    readinessError = null;
    notifySubscribers(data, null, false);
    return data;
  } catch (error) {
    readinessError = error instanceof Error ? error : new Error(String(error));
    notifySubscribers(readinessCache, readinessError, false);
    throw readinessError;
  } finally {
    isFetching = false;
  }
}

export function useTracerReadiness() {
  const [readiness, setReadiness] = useState<TracerReadinessResponse | null>(
    readinessCache,
  );
  const [error, setError] = useState<Error | null>(readinessError);
  const [loading, setLoading] = useState<boolean>(
    !readinessCache && isFetching,
  );

  useEffect(() => {
    if (readinessCache) setReadiness(readinessCache);
    if (readinessError) setError(readinessError);

    const handleUpdate = (
      nextReadiness: TracerReadinessResponse | null,
      nextError: Error | null,
      nextLoading: boolean,
    ) => {
      setReadiness(nextReadiness);
      setError(nextError);
      setLoading(nextLoading);
    };

    subscribers.add(handleUpdate);

    if (!readinessCache && !isFetching) {
      void runReadinessFetch(false);
    }

    return () => {
      subscribers.delete(handleUpdate);
    };
  }, []);

  const refreshReadiness = async (force = true) => {
    return await runReadinessFetch(force);
  };

  return {
    readiness,
    error,
    isLoading: loading && !readiness,
    isChecking: loading,
    refreshReadiness,
  };
}

/** @internal For testing only */
export function _resetTracerReadinessCache() {
  readinessCache = null;
  readinessError = null;
  isFetching = false;
  subscribers.clear();
}
