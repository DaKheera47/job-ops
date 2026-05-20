import type {
  NormalizedWorkdayJob,
  NormalizedWorkdayJobDetails,
  WorkdayCxsJobsResult,
} from "@client/api/workday";
import type {
  JobListItem,
  ManualJobDraft,
  WatchlistSelectedSource,
  WatchlistSource,
} from "@shared/types.js";

export type WatchlistFetchState =
  | {
      status: "loading";
      source: WatchlistSelectedSource;
    }
  | {
      status: "success";
      source: WatchlistSelectedSource;
      response: WorkdayCxsJobsResult;
    }
  | {
      status: "error";
      source: WatchlistSelectedSource;
      error: string;
    };

export interface SourceSelectionDraft {
  id: string;
  isCustom: boolean;
  catalogSourceId: string | null;
  customUrl: string;
}

export type JobDetailsState =
  | {
      status: "loading";
    }
  | {
      status: "success";
      details: NormalizedWorkdayJobDetails;
    }
  | {
      status: "error";
      error: string;
    };

export interface RankedWorkdayJob {
  workdayJob: NormalizedWorkdayJob;
  job: JobListItem;
  matchScore: number;
  matchedSearchTerm: string | null;
  locationPriority: 0 | 1;
  locationMatched: boolean;
}

export interface WorkdayImportState {
  open: boolean;
  draft: ManualJobDraft | null;
  source: string | null;
  sourceHost: string | null;
  workdaySource: string | null;
  sourceType: string | null;
  catalogSourceId: string | null;
}

export type WatchlistRowState = "new" | "ignored" | "moved_to_workspace";

export interface WatchlistCheckState {
  checkedAt: string | null;
  previousLastCheckedAt: string | null;
  newJobKeys: Set<string>;
}

export interface WatchlistSourceDraftCardProps {
  sourceDrafts: SourceSelectionDraft[];
  sourceStatusByDraftId: Record<string, "watching" | "unsaved">;
  catalogSources: WatchlistSource[];
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
    workdaySource?: string;
  }) => void;
  onSourceSearchNoResults: (input: { searchText: string }) => void;
  onSave: () => void;
}
