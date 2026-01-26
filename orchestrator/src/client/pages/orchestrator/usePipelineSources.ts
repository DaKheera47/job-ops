import { useCallback, useEffect, useMemo, useState } from "react";

import type { JobSource } from "../../../shared/types";
import {
  DEFAULT_PIPELINE_SOURCES,
  orderedSources,
  PIPELINE_SOURCES_STORAGE_KEY,
} from "./constants";

const resolveAllowedSources = (enabledSources?: JobSource[]) =>
  enabledSources && enabledSources.length > 0
    ? enabledSources
    : DEFAULT_PIPELINE_SOURCES;

const normalizeSources = (
  sources: JobSource[],
  allowedSources: JobSource[],
) => {
  const filtered = sources.filter((value) => allowedSources.includes(value));
  return filtered.length > 0 ? filtered : allowedSources.slice(0, 1);
};

const sourcesMatch = (left: JobSource[], right: JobSource[]) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export const usePipelineSources = (enabledSources?: JobSource[]) => {
  const allowedSources = useMemo(
    () => resolveAllowedSources(enabledSources),
    [enabledSources],
  );
  const [pipelineSources, setPipelineSources] = useState<JobSource[]>(() => {
    try {
      const raw = localStorage.getItem(PIPELINE_SOURCES_STORAGE_KEY);
      if (!raw) return normalizeSources(allowedSources, allowedSources);
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed))
        return normalizeSources(allowedSources, allowedSources);
      const next = parsed.filter((value): value is JobSource =>
        orderedSources.includes(value as JobSource),
      );
      return normalizeSources(next, allowedSources);
    } catch {
      return normalizeSources(allowedSources, allowedSources);
    }
  });

  useEffect(() => {
    setPipelineSources((current) => {
      const normalized = normalizeSources(current, allowedSources);
      return sourcesMatch(current, normalized) ? current : normalized;
    });
  }, [allowedSources]);

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
      if (!allowedSources.includes(source)) return;
      setPipelineSources((current) => {
        const next = checked
          ? Array.from(new Set([...current, source]))
          : current.filter((value) => value !== source);

        return next.length === 0 ? current : next;
      });
    },
    [allowedSources],
  );

  return { pipelineSources, setPipelineSources, toggleSource };
};
