import type { CreateJobInput } from "./jobs";
import type {
  LocationIntent,
  LocationSourceCapabilitiesInput,
  SourceLocationPlan,
} from "./location";

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

export interface ExtractorCapabilities {
  locationEvidence?: boolean;
}

export type ExtractorSourceLocationCapabilities = Omit<
  LocationSourceCapabilitiesInput,
  "source"
>;

export interface ExtractorRuntimeContext {
  source: string;
  selectedSources: string[];
  settings: Record<string, string | undefined>;
  searchTerms: string[];
  selectedCountry: string;
  /** Tenant-scoped directory for browser challenge cookies. */
  cookieStorageDir?: string;
  /** Server-owned browser reader for Hiring Cafe's tenant-scoped session. */
  browserPageReader?: (url: string) => Promise<{
    status: number;
    html: string;
    challenged: boolean;
  }>;
  /** Challenged URL from this run's earlier paused discovery attempt. */
  retryChallengeUrl?: string;
  /** Opaque checkpoint returned by this extractor during an earlier challenge. */
  resumeState?: unknown;
  /** Search states skipped by the user while resolving Hiring Cafe challenges. */
  skippedChallengeSearchStates?: string[];
  locationIntent?: LocationIntent;
  sourceLocationPlan?: SourceLocationPlan;
  getExistingJobUrls?: () => Promise<string[]>;
  shouldCancel?: () => boolean;
  onProgress?: (event: ExtractorProgressEvent) => void;
}

export interface ExtractorRunResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
  sourceErrors?: string[];
  /** URL that needs a human solve. A successful result may include partial jobs
   *  while the pipeline pauses and retries the challenged source. */
  challengeRequired?: string;
  /** Opaque checkpoint to return only to this extractor on retry. */
  resumeState?: unknown;
}

export interface ExtractorManifest {
  id: string;
  displayName: string;
  providesSources: readonly string[];
  requiredEnvVars?: readonly string[];
  capabilities?: ExtractorCapabilities;
  locationCapabilities?: Partial<
    Record<string, ExtractorSourceLocationCapabilities>
  >;
  run: (context: ExtractorRuntimeContext) => Promise<ExtractorRunResult>;
}
