import { useCallback, useEffect, useState } from "react";

import type { JobSource } from "../../../shared/types";
import {
  DEFAULT_PIPELINE_SOURCES,
  PIPELINE_SOURCES_STORAGE_KEY,
  orderedSources,
} from "./constants";

export const usePipelineSources = () => {
  const [pipelineSources, setPipelineSources] = useState<JobSource[]>(() => {
    try {
      const raw = localStorage.getItem(PIPELINE_SOURCES_STORAGE_KEY);
      if (!raw) return DEFAULT_PIPELINE_SOURCES;
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return DEFAULT_PIPELINE_SOURCES;
      const next = parsed.filter((value): value is JobSource => orderedSources.includes(value as JobSource));
      return next.length > 0 ? next : DEFAULT_PIPELINE_SOURCES;
    } catch {
      return DEFAULT_PIPELINE_SOURCES;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(PIPELINE_SOURCES_STORAGE_KEY, JSON.stringify(pipelineSources));
    } catch {
      // Ignore localStorage errors
    }
  }, [pipelineSources]);

  const toggleSource = useCallback((source: JobSource, checked: boolean) => {
    setPipelineSources((current) => {
      const next = checked
        ? Array.from(new Set([...current, source]))
        : current.filter((value) => value !== source);

      return next.length === 0 ? current : next;
    });
  }, []);

  return { pipelineSources, setPipelineSources, toggleSource };
};
