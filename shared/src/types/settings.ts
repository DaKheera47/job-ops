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

export interface AppSettings {
  model: string;
  defaultModel: string;
  overrideModel: string | null;
  // Specific model overrides
  modelScorer: string; // resolved
  overrideModelScorer: string | null;
  modelTailoring: string; // resolved
  overrideModelTailoring: string | null;
  modelProjectSelection: string; // resolved
  overrideModelProjectSelection: string | null;

  llmProvider: string;
  defaultLlmProvider: string;
  overrideLlmProvider: string | null;
  llmBaseUrl: string;
  defaultLlmBaseUrl: string;
  overrideLlmBaseUrl: string | null;

  pipelineWebhookUrl: string;
  defaultPipelineWebhookUrl: string;
  overridePipelineWebhookUrl: string | null;
  jobCompleteWebhookUrl: string;
  defaultJobCompleteWebhookUrl: string;
  overrideJobCompleteWebhookUrl: string | null;
  profileProjects: ResumeProjectCatalogItem[];
  resumeProjects: ResumeProjectsSettings;
  defaultResumeProjects: ResumeProjectsSettings;
  overrideResumeProjects: ResumeProjectsSettings | null;
  rxresumeBaseResumeId: string | null;
  ukvisajobsMaxJobs: number;
  defaultUkvisajobsMaxJobs: number;
  overrideUkvisajobsMaxJobs: number | null;
  adzunaMaxJobsPerTerm: number;
  defaultAdzunaMaxJobsPerTerm: number;
  overrideAdzunaMaxJobsPerTerm: number | null;
  gradcrackerMaxJobsPerTerm: number;
  defaultGradcrackerMaxJobsPerTerm: number;
  overrideGradcrackerMaxJobsPerTerm: number | null;
  searchTerms: string[];
  defaultSearchTerms: string[];
  overrideSearchTerms: string[] | null;
  searchCities: string;
  defaultSearchCities: string;
  overrideSearchCities: string | null;
  jobspyResultsWanted: number;
  defaultJobspyResultsWanted: number;
  overrideJobspyResultsWanted: number | null;
  jobspyCountryIndeed: string;
  defaultJobspyCountryIndeed: string;
  overrideJobspyCountryIndeed: string | null;
  showSponsorInfo: boolean;
  defaultShowSponsorInfo: boolean;
  overrideShowSponsorInfo: boolean | null;
  chatStyleTone: string;
  defaultChatStyleTone: string;
  overrideChatStyleTone: string | null;
  chatStyleFormality: string;
  defaultChatStyleFormality: string;
  overrideChatStyleFormality: string | null;
  chatStyleConstraints: string;
  defaultChatStyleConstraints: string;
  overrideChatStyleConstraints: string | null;
  chatStyleDoNotUse: string;
  defaultChatStyleDoNotUse: string;
  overrideChatStyleDoNotUse: string | null;
  llmApiKeyHint: string | null;
  rxresumeEmail: string | null;
  rxresumePasswordHint: string | null;
  basicAuthUser: string | null;
  basicAuthPasswordHint: string | null;
  ukvisajobsEmail: string | null;
  ukvisajobsPasswordHint: string | null;
  adzunaAppId: string | null;
  adzunaAppKeyHint: string | null;
  webhookSecretHint: string | null;
  basicAuthActive: boolean;
  // Backup settings
  backupEnabled: boolean;
  defaultBackupEnabled: boolean;
  overrideBackupEnabled: boolean | null;
  backupHour: number;
  defaultBackupHour: number;
  overrideBackupHour: number | null;
  backupMaxCount: number;
  defaultBackupMaxCount: number;
  overrideBackupMaxCount: number | null;
  // Scoring settings
  penalizeMissingSalary: boolean;
  defaultPenalizeMissingSalary: boolean;
  overridePenalizeMissingSalary: boolean | null;
  missingSalaryPenalty: number;
  defaultMissingSalaryPenalty: number;
  overrideMissingSalaryPenalty: number | null;
  // Auto-skip settings
  autoSkipScoreThreshold: number | null;
  defaultAutoSkipScoreThreshold: number | null;
  overrideAutoSkipScoreThreshold: number | null;
}
