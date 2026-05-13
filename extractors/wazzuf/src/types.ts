export type WazzufProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export interface RunWazzufOptions {
  searchTerms?: string[];
  maxJobsPerTerm?: number;
  fetchImpl?: typeof fetch;
  shouldCancel?: () => boolean;
  onProgress?: (event: WazzufProgressEvent) => void;
}
