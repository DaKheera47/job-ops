export interface ResumeProjectCatalogItem {
  id: string;
  name: string;
  description: string;
  date: string;
  isVisibleInBase: boolean;
}

export interface ResumeProjectsSettings {
  maxProjects: number;
  lockedProjectIds: string[];
  aiSelectableProjectIds: string[];
}

export interface ResumeProfile {
  basics?: {
    name?: string;
    label?: string;
    image?: string;
    email?: string;
    phone?: string;
    url?: string;
    summary?: string;
    headline?: string;
    location?: {
      address?: string;
      postalCode?: string;
      city?: string;
      countryCode?: string;
      region?: string;
    };
    profiles?: Array<{
      network?: string;
      username?: string;
      url?: string;
    }>;
  };
  sections?: {
    summary?: {
      id?: string;
      visible?: boolean;
      name?: string;
      content?: string;
    };
    skills?: {
      id?: string;
      visible?: boolean;
      name?: string;
      items?: Array<{
        id: string;
        name: string;
        description: string;
        level: number;
        keywords: string[];
        visible: boolean;
      }>;
    };
    projects?: {
      id?: string;
      visible?: boolean;
      name?: string;
      items?: Array<{
        id: string;
        name: string;
        description: string;
        date: string;
        summary: string;
        visible: boolean;
        keywords?: string[];
        url?: string;
      }>;
    };
    experience?: {
      id?: string;
      visible?: boolean;
      name?: string;
      items?: Array<{
        id: string;
        company: string;
        position: string;
        location: string;
        date: string;
        summary: string;
        visible: boolean;
      }>;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface ProfileStatusResponse {
  exists: boolean;
  error: string | null;
}

export interface ValidationResult {
  valid: boolean;
  message: string | null;
}

export interface DemoInfoResponse {
  demoMode: boolean;
  resetCadenceHours: number;
  lastResetAt: string | null;
  nextResetAt: string | null;
  baselineVersion: string | null;
  baselineName: string | null;
}

export type Resolved<T> = { value: T; default: T; override: T | null };
export type ModelResolved = { value: string; override: string | null };

export interface AppSettings {
  // Typed settings (Resolved):
  model: Resolved<string>;
  llmProvider: Resolved<string>;
  llmBaseUrl: Resolved<string>;
  pipelineWebhookUrl: Resolved<string>;
  jobCompleteWebhookUrl: Resolved<string>;
  resumeProjects: Resolved<ResumeProjectsSettings>;
  ukvisajobsMaxJobs: Resolved<number>;
  adzunaMaxJobsPerTerm: Resolved<number>;
  gradcrackerMaxJobsPerTerm: Resolved<number>;
  searchTerms: Resolved<string[]>;
  blockedCompanyKeywords: Resolved<string[]>;
  searchCities: Resolved<string>;
  jobspyResultsWanted: Resolved<number>;
  jobspyCountryIndeed: Resolved<string>;
  showSponsorInfo: Resolved<boolean>;
  chatStyleTone: Resolved<string>;
  chatStyleFormality: Resolved<string>;
  chatStyleConstraints: Resolved<string>;
  chatStyleDoNotUse: Resolved<string>;
  backupEnabled: Resolved<boolean>;
  backupHour: Resolved<number>;
  backupMaxCount: Resolved<number>;
  penalizeMissingSalary: Resolved<boolean>;
  missingSalaryPenalty: Resolved<number>;
  autoSkipScoreThreshold: Resolved<number | null>;

  // Model variants (no own default, fallback to model.value):
  modelScorer: ModelResolved;
  modelTailoring: ModelResolved;
  modelProjectSelection: ModelResolved;

  // Simple strings:
  rxresumeBaseResumeId: string | null;
  rxresumeEmail: string | null;
  ukvisajobsEmail: string | null;
  adzunaAppId: string | null;
  basicAuthUser: string | null;

  // Secret hints:
  llmApiKeyHint: string | null;
  rxresumePasswordHint: string | null;
  ukvisajobsPasswordHint: string | null;
  adzunaAppKeyHint: string | null;
  basicAuthPasswordHint: string | null;
  webhookSecretHint: string | null;

  // Computed:
  basicAuthActive: boolean;
  profileProjects: ResumeProjectCatalogItem[];
}
