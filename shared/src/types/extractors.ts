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
  /** Challenged URL from this run's earlier paused discovery attempt. */
  retryChallengeUrl?: string;
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
