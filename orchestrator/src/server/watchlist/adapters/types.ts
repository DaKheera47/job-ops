import type {
  ManualJobDraft,
  WatchedSourceType,
  WatchlistJobDetailsResponse,
  WatchlistJobResult,
  WatchlistSelectedSource,
  WatchlistSource,
  WatchlistSourceBrandingResponse,
  WatchlistSourceTypeDescriptor,
} from "@shared/types";
import type { z } from "zod";

export interface WatchlistCatalogSourceAdapter {
  sourceType: WatchedSourceType;
  descriptor: WatchlistSourceTypeDescriptor;
  catalogSchema: z.ZodType<unknown>;
  parseCatalogSources(entries: unknown[]): WatchlistSource[];
  hydrateSelectedSource(
    source: WatchlistSelectedSource,
  ): WatchlistSelectedSource;
  normalizeCustomSelection(input: {
    label: string | null | undefined;
    careersUrl: string;
  }): {
    label: string;
    careersUrl: string;
  };
  fetchJobs(input: {
    source: WatchlistSelectedSource;
    signal?: AbortSignal;
  }): Promise<WatchlistAdapterJobsResult>;
  fetchJobDetails(input: {
    source: WatchlistSelectedSource;
    jobRef: string;
    signal?: AbortSignal;
  }): Promise<WatchlistJobDetailsResponse>;
  prepareImportDraft(input: {
    source: WatchlistSelectedSource;
    jobRef: string;
    signal?: AbortSignal;
  }): Promise<WatchlistAdapterImportDraftResult>;
  fetchBranding?(input: {
    source: Pick<WatchlistSelectedSource, "careersUrl" | "sourceType">;
    signal?: AbortSignal;
  }): Promise<WatchlistSourceBrandingResponse>;
}

export interface WatchlistAdapterJobsResult {
  total: number;
  fetched: number;
  jobs: Array<
    Omit<
      WatchlistJobResult,
      "rowState" | "isNewSinceLastCheck" | "workspaceJob"
    >
  >;
}

export interface WatchlistAdapterImportDraftResult {
  draft: ManualJobDraft;
  source: string | null;
  sourceHost: string | null;
}
