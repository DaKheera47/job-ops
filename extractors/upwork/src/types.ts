export interface UpworkRssItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
  description?: unknown;
  guid?: unknown;
}

export interface UpworkRssPayload {
  rss?: {
    channel?: {
      item?: UpworkRssItem | UpworkRssItem[];
    };
  };
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
  maxJobsPerTerm?: number;
  fetchImpl?: typeof fetch;
  shouldCancel?: () => boolean;
  onProgress?: (event: UpworkProgressEvent) => void;
}
