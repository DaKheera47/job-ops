export type EffectiveDefault<T> = {
  effective: T;
  default: T;
};

export type ModelValues = EffectiveDefault<string> & {
  scorer: string;
  tailoring: string;
  projectSelection: string;
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKeyHint: string | null;
};

export type WebhookValues = EffectiveDefault<string>;
export type DisplayValues = EffectiveDefault<boolean>;
export type ChatValues = {
  tone: EffectiveDefault<string>;
  formality: EffectiveDefault<string>;
  constraints: EffectiveDefault<string>;
  doNotUse: EffectiveDefault<string>;
};

export type EnvSettingsValues = {
  readable: {
    rxresumeEmail: string;
    ukvisajobsEmail: string;
    basicAuthUser: string;
  };
  private: {
    rxresumePasswordHint: string | null;
    ukvisajobsPasswordHint: string | null;
    basicAuthPasswordHint: string | null;
    webhookSecretHint: string | null;
  };
  basicAuthActive: boolean;
};

export type BackupValues = {
  backupEnabled: EffectiveDefault<boolean>;
  backupHour: EffectiveDefault<number>;
  backupMaxCount: EffectiveDefault<number>;
};

export type ScoringValues = {
  penalizeMissingSalary: EffectiveDefault<boolean>;
  missingSalaryPenalty: EffectiveDefault<number>;
  autoSkipScoreThreshold: EffectiveDefault<number | null>;
};
