import type { CreateJobInput } from "./jobs";

export interface ExtractorProgressEvent {
  phase?: "list" | "job";
  currentUrl?: string;
  termsProcessed?: number;
  termsTotal?: number;
  listPagesProcessed?: number;
  listPagesTotal?: number;
  jobCardsFound?: number;
  jobPagesEnqueued?: number;
  jobPagesSkipped?: number;
  jobPagesProcessed?: number;
  detail?: string;
}

export interface ExtractorRuntimeContext {
  source: string;
  selectedSources: string[];
  settings: Record<string, string | undefined>;
  searchTerms: string[];
  selectedCountry: string;
  getExistingJobUrls?: () => Promise<string[]>;
  shouldCancel?: () => boolean;
  onProgress?: (event: ExtractorProgressEvent) => void;
}

export interface ExtractorRunResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

export interface ExtractorManifest {
  id: string;
  displayName: string;
  providesSources: readonly string[];
  requiredEnvVars?: readonly string[];
  run: (context: ExtractorRuntimeContext) => Promise<ExtractorRunResult>;
}
