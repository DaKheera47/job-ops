import type {
  JobListItem,
  ManualJobDraft,
  WatchedSourceType,
  WatchlistJobDetailsResponse,
  WatchlistJobResult,
  WatchlistRowState,
  WatchlistSelectedSource,
  WatchlistSource,
  WatchlistSourceResult,
  WatchlistSourceTypeDescriptor,
} from "@shared/types.js";

export type WatchlistFetchState =
  | {
      status: "loading";
      source: WatchlistSelectedSource;
    }
  | WatchlistSourceResult;

export interface SourceSelectionDraft {
  id: string;
  isCustom: boolean;
  sourceType: WatchedSourceType;
  catalogSourceId: string | null;
  customUrl: string;
}

export type JobDetailsState =
  | {
      status: "loading";
    }
  | {
      status: "success";
      details: WatchlistJobDetailsResponse;
    }
  | {
      status: "error";
      error: string;
    };

export interface RankedWatchlistJob {
  watchlistJob: WatchlistJobResult;
  job: JobListItem;
  matchScore: number;
  matchedSearchTerm: string | null;
  locationPriority: 0 | 1;
  locationMatched: boolean;
  rowState: WatchlistRowState;
}

export interface WatchlistImportState {
  open: boolean;
  draft: ManualJobDraft | null;
  source: string | null;
  sourceHost: string | null;
  sourceType: string | null;
  catalogSourceId: string | null;
  careersUrl: string | null;
}

export interface WatchlistCheckState {
  checkedAt: string | null;
  previousLastCheckedAt: string | null;
  newJobKeys: Set<string>;
}

export interface WatchlistSourceDraftCardProps {
  sourceDrafts: SourceSelectionDraft[];
  sourceStatusByDraftId: Record<string, "watching" | "unsaved">;
  catalogSources: WatchlistSource[];
  sourceTypes: WatchlistSourceTypeDescriptor[];
  formattedLastCheckedAt: string | null;
  formattedPreviousLastCheckedAt: string | null;
  newJobsCount: number;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onAddSource: () => void;
  onRemoveSource: (index: number) => void;
  onUpdateDraft: (
    index: number,
    updater: (draft: SourceSelectionDraft) => SourceSelectionDraft,
  ) => void;
  onSourceMethodSelected: (input: {
    method: "catalog" | "custom_url";
    catalogSourceId?: string;
    sourceType?: string;
    careersUrl?: string;
  }) => void;
  onSourceSearchNoResults: (input: { searchText: string }) => void;
  onSave: () => void;
}
