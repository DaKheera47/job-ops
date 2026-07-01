export interface UpworkApifyInput {
  query: string;
  location?: string[];
  maxResults: number;
  sort: "recency";
  enrichDetails: false;
}

export type UpworkApifyItem = Record<string, unknown>;

export interface UpworkApifyRun {
  defaultDatasetId: string;
}

export interface UpworkApifyActor {
  call(input: UpworkApifyInput): Promise<UpworkApifyRun>;
}

export interface UpworkApifyDataset {
  listItems(options?: { limit?: number }): Promise<{ items: unknown[] }>;
}

export interface UpworkApifyClient {
  actor(actorId: string): UpworkApifyActor;
  dataset(datasetId: string): UpworkApifyDataset;
}

export type UpworkProgressEvent =
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

export interface RunUpworkOptions {
  searchTerms?: string[];
  location?: string;
  maxJobsPerTerm?: number;
  actorId?: string;
  apifyClient?: UpworkApifyClient;
  shouldCancel?: () => boolean;
  onProgress?: (event: UpworkProgressEvent) => void;
}
