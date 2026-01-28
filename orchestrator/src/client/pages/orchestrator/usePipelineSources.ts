import { useCallback, useEffect, useMemo, useState } from "react";

import type { JobSource } from "../../../shared/types";
import { orderedSources, PIPELINE_SOURCES_STORAGE_KEY } from "./constants";

const normalizeSources = (
  sources: JobSource[],
  allowedSources: JobSource[],
  enabledSources: JobSource[],
) => {
  const filtered = sources.filter((value) => allowedSources.includes(value));
  // If no valid sources remain, default to enabled sources (or first allowed if none enabled)
  return filtered.length > 0
    ? filtered
    : enabledSources.length > 0
      ? enabledSources
      : allowedSources.slice(0, 1);
};

const sourcesMatch = (left: JobSource[], right: JobSource[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export const usePipelineSources = (
  allowedSources: readonly JobSource[],
  enabledSources: readonly JobSource[],
) => {
  const allowedSourcesList = useMemo(
    () => allowedSources as JobSource[],
    [allowedSources],
  );
  const enabledSourcesList = useMemo(
    () => enabledSources as JobSource[],
    [enabledSources],
  );
  const [pipelineSources, setPipelineSources] = useState<JobSource[]>(() => {
    try {
      const raw = localStorage.getItem(PIPELINE_SOURCES_STORAGE_KEY);
      if (!raw)
        return normalizeSources(
          enabledSourcesList,
          allowedSourcesList,
          enabledSourcesList,
        );
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed))
        return normalizeSources(
          enabledSourcesList,
          allowedSourcesList,
          enabledSourcesList,
        );
      const next = parsed.filter((value): value is JobSource =>
        orderedSources.includes(value as JobSource),
      );
      return normalizeSources(next, allowedSourcesList, enabledSourcesList);
    } catch {
      return normalizeSources(
        enabledSourcesList,
        allowedSourcesList,
        enabledSourcesList,
      );
    }
  });

  useEffect(() => {
    setPipelineSources((current) => {
      const normalized = normalizeSources(
        current,
        allowedSourcesList,
        enabledSourcesList,
      );
      return sourcesMatch(current, normalized) ? current : normalized;
    });
  }, [allowedSourcesList, enabledSourcesList]);

  useEffect(() => {
    try {
      localStorage.setItem(
        PIPELINE_SOURCES_STORAGE_KEY,
        JSON.stringify(pipelineSources),
      );
    } catch {
      // Ignore localStorage errors
    }
  }, [pipelineSources]);

  const toggleSource = useCallback(
    (source: JobSource, checked: boolean) => {
      if (!allowedSourcesList.includes(source)) return;
      setPipelineSources((current) => {
        const next = checked
          ? Array.from(new Set([...current, source]))
          : current.filter((value) => value !== source);

        return next.length === 0 ? current : next;
      });
    },
    [allowedSourcesList],
  );

  return { pipelineSources, setPipelineSources, toggleSource };
};
