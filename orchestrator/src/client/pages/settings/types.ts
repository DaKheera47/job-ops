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
export type NumericSettingValues = EffectiveDefault<number>;
export type SearchTermsValues = EffectiveDefault<string[]>;
export type DisplayValues = EffectiveDefault<boolean>;

export type JobspyValues = {
  sites: EffectiveDefault<string[]>;
  location: EffectiveDefault<string>;
  resultsWanted: EffectiveDefault<number>;
  hoursOld: EffectiveDefault<number>;
  countryIndeed: EffectiveDefault<string>;
  linkedinFetchDescription: EffectiveDefault<boolean>;
  isRemote: EffectiveDefault<boolean>;
};

export type EnvSettingsValues = {
  readable: {
    rxresumeEmail: string;
    ukvisajobsEmail: string;
    basicAuthUser: string;
  };
  private: {
    openrouterApiKeyHint: string | null;
    rxresumePasswordHint: string | null;
    ukvisajobsPasswordHint: string | null;
    basicAuthPasswordHint: string | null;
    webhookSecretHint: string | null;
  };
  basicAuthActive: boolean;
};
