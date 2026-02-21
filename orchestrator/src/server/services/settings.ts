import * as settingsRepo from "@server/repositories/settings";
import type { AppSettings } from "@shared/types";
import { getEnvSettingsData } from "./envSettings";
import { getProfile } from "./profile";
import {
  extractProjectsFromProfile,
  resolveResumeProjectsSettings,
} from "./resumeProjects";
import { getResume, RxResumeCredentialsError } from "./rxresume-v4";
import { resolveSettingValue } from "./settings-conversion";

/**
 * Get the effective app settings, combining environment variables and database overrides.
 */
export async function getEffectiveSettings(): Promise<AppSettings> {
  const overrides = await settingsRepo.getAllSettings();

  const rxresumeBaseResumeId = overrides.rxresumeBaseResumeId ?? null;
  let profile: Record<string, unknown> = {};

  if (rxresumeBaseResumeId) {
    try {
      const resume = await getResume(rxresumeBaseResumeId);
      if (resume.data && typeof resume.data === "object") {
        profile = resume.data as Record<string, unknown>;
      }
    } catch (error) {
      if (error instanceof RxResumeCredentialsError) {
        console.warn(
          "RxResume credentials missing while loading base resume from settings.",
        );
      } else {
        console.warn(
          "Failed to load RxResume base resume for settings:",
          error,
        );
      }
    }
  }

  if (Object.keys(profile).length === 0) {
    profile = await getProfile().catch((error) => {
      console.warn("Failed to load base resume profile for settings:", error);
      return {};
    });
  }

  const envSettings = await getEnvSettingsData(overrides);

  const defaultModel = process.env.MODEL || "google/gemini-3-flash-preview";
  const overrideModel = overrides.model ?? null;
  const model = overrideModel || defaultModel;

  const overrideModelScorer = overrides.modelScorer ?? null;
  const modelScorer = overrideModelScorer || model;

  const overrideModelTailoring = overrides.modelTailoring ?? null;
  const modelTailoring = overrideModelTailoring || model;

  const overrideModelProjectSelection = overrides.modelProjectSelection ?? null;
  const modelProjectSelection = overrideModelProjectSelection || model;

  const defaultLlmProvider = process.env.LLM_PROVIDER || "openrouter";
  const overrideLlmProvider = overrides.llmProvider ?? null;
  const llmProvider = overrideLlmProvider || defaultLlmProvider;

  const defaultLlmBaseUrl =
    process.env.LLM_BASE_URL || resolveDefaultLlmBaseUrl(llmProvider);
  const overrideLlmBaseUrl = overrides.llmBaseUrl ?? null;
  const llmBaseUrl = overrideLlmBaseUrl || defaultLlmBaseUrl;

  const defaultPipelineWebhookUrl =
    process.env.PIPELINE_WEBHOOK_URL || process.env.WEBHOOK_URL || "";
  const overridePipelineWebhookUrl = overrides.pipelineWebhookUrl ?? null;
  const pipelineWebhookUrl =
    overridePipelineWebhookUrl || defaultPipelineWebhookUrl;

  const defaultJobCompleteWebhookUrl =
    process.env.JOB_COMPLETE_WEBHOOK_URL || "";
  const overrideJobCompleteWebhookUrl = overrides.jobCompleteWebhookUrl ?? null;
  const jobCompleteWebhookUrl =
    overrideJobCompleteWebhookUrl || defaultJobCompleteWebhookUrl;

  const { catalog } = extractProjectsFromProfile(profile);
  const overrideResumeProjectsRaw = overrides.resumeProjects ?? null;
  const resumeProjectsData = resolveResumeProjectsSettings({
    catalog,
    overrideRaw: overrideResumeProjectsRaw,
  });

  const ukvisajobsMaxJobsSetting = resolveSettingValue(
    "ukvisajobsMaxJobs",
    overrides.ukvisajobsMaxJobs,
  );
  const defaultUkvisajobsMaxJobs = ukvisajobsMaxJobsSetting.defaultValue;
  const overrideUkvisajobsMaxJobs = ukvisajobsMaxJobsSetting.overrideValue;
  const ukvisajobsMaxJobs = ukvisajobsMaxJobsSetting.value;

  const adzunaMaxJobsPerTermSetting = resolveSettingValue(
    "adzunaMaxJobsPerTerm",
    overrides.adzunaMaxJobsPerTerm,
  );
  const defaultAdzunaMaxJobsPerTerm = adzunaMaxJobsPerTermSetting.defaultValue;
  const overrideAdzunaMaxJobsPerTerm =
    adzunaMaxJobsPerTermSetting.overrideValue;
  const adzunaMaxJobsPerTerm = adzunaMaxJobsPerTermSetting.value;

  const gradcrackerMaxJobsPerTermSetting = resolveSettingValue(
    "gradcrackerMaxJobsPerTerm",
    overrides.gradcrackerMaxJobsPerTerm,
  );
  const defaultGradcrackerMaxJobsPerTerm =
    gradcrackerMaxJobsPerTermSetting.defaultValue;
  const overrideGradcrackerMaxJobsPerTerm =
    gradcrackerMaxJobsPerTermSetting.overrideValue;
  const gradcrackerMaxJobsPerTerm = gradcrackerMaxJobsPerTermSetting.value;

  const searchTermsSetting = resolveSettingValue(
    "searchTerms",
    overrides.searchTerms,
  );
  const defaultSearchTerms = searchTermsSetting.defaultValue;
  const overrideSearchTerms = searchTermsSetting.overrideValue;
  const searchTerms = searchTermsSetting.value;

  const searchCitiesSetting = resolveSettingValue(
    "searchCities",
    overrides.searchCities ?? overrides.jobspyLocation,
  );
  const defaultSearchCities = searchCitiesSetting.defaultValue;
  const overrideSearchCities = searchCitiesSetting.overrideValue;
  const searchCities = searchCitiesSetting.value;

  const jobspyResultsWantedSetting = resolveSettingValue(
    "jobspyResultsWanted",
    overrides.jobspyResultsWanted,
  );
  const defaultJobspyResultsWanted = jobspyResultsWantedSetting.defaultValue;
  const overrideJobspyResultsWanted = jobspyResultsWantedSetting.overrideValue;
  const jobspyResultsWanted = jobspyResultsWantedSetting.value;

  const jobspyCountryIndeedSetting = resolveSettingValue(
    "jobspyCountryIndeed",
    overrides.jobspyCountryIndeed,
  );
  const defaultJobspyCountryIndeed = jobspyCountryIndeedSetting.defaultValue;
  const overrideJobspyCountryIndeed = jobspyCountryIndeedSetting.overrideValue;
  const jobspyCountryIndeed = jobspyCountryIndeedSetting.value;

  const showSponsorInfoSetting = resolveSettingValue(
    "showSponsorInfo",
    overrides.showSponsorInfo,
  );
  const defaultShowSponsorInfo = showSponsorInfoSetting.defaultValue;
  const overrideShowSponsorInfo = showSponsorInfoSetting.overrideValue;
  const showSponsorInfo = showSponsorInfoSetting.value;

  const chatStyleToneSetting = resolveSettingValue(
    "chatStyleTone",
    overrides.chatStyleTone,
  );
  const defaultChatStyleTone = chatStyleToneSetting.defaultValue;
  const overrideChatStyleTone = chatStyleToneSetting.overrideValue;
  const chatStyleTone = chatStyleToneSetting.value;

  const chatStyleFormalitySetting = resolveSettingValue(
    "chatStyleFormality",
    overrides.chatStyleFormality,
  );
  const defaultChatStyleFormality = chatStyleFormalitySetting.defaultValue;
  const overrideChatStyleFormality = chatStyleFormalitySetting.overrideValue;
  const chatStyleFormality = chatStyleFormalitySetting.value;

  const chatStyleConstraintsSetting = resolveSettingValue(
    "chatStyleConstraints",
    overrides.chatStyleConstraints,
  );
  const defaultChatStyleConstraints = chatStyleConstraintsSetting.defaultValue;
  const overrideChatStyleConstraints =
    chatStyleConstraintsSetting.overrideValue;
  const chatStyleConstraints = chatStyleConstraintsSetting.value;

  const chatStyleDoNotUseSetting = resolveSettingValue(
    "chatStyleDoNotUse",
    overrides.chatStyleDoNotUse,
  );
  const defaultChatStyleDoNotUse = chatStyleDoNotUseSetting.defaultValue;
  const overrideChatStyleDoNotUse = chatStyleDoNotUseSetting.overrideValue;
  const chatStyleDoNotUse = chatStyleDoNotUseSetting.value;

  const backupEnabledSetting = resolveSettingValue(
    "backupEnabled",
    overrides.backupEnabled,
  );
  const defaultBackupEnabled = backupEnabledSetting.defaultValue;
  const overrideBackupEnabled = backupEnabledSetting.overrideValue;
  const backupEnabled = backupEnabledSetting.value;

  const backupHourSetting = resolveSettingValue(
    "backupHour",
    overrides.backupHour,
  );
  const defaultBackupHour = backupHourSetting.defaultValue;
  const overrideBackupHour = backupHourSetting.overrideValue;
  const backupHour = backupHourSetting.value;

  const backupMaxCountSetting = resolveSettingValue(
    "backupMaxCount",
    overrides.backupMaxCount,
  );
  const defaultBackupMaxCount = backupMaxCountSetting.defaultValue;
  const overrideBackupMaxCount = backupMaxCountSetting.overrideValue;
  const backupMaxCount = backupMaxCountSetting.value;

  const penalizeMissingSalarySetting = resolveSettingValue(
    "penalizeMissingSalary",
    overrides.penalizeMissingSalary,
  );
  const defaultPenalizeMissingSalary =
    penalizeMissingSalarySetting.defaultValue;
  const overridePenalizeMissingSalary =
    penalizeMissingSalarySetting.overrideValue;
  const penalizeMissingSalary = penalizeMissingSalarySetting.value;

  const missingSalaryPenaltySetting = resolveSettingValue(
    "missingSalaryPenalty",
    overrides.missingSalaryPenalty,
  );
  const defaultMissingSalaryPenalty = missingSalaryPenaltySetting.defaultValue;
  const overrideMissingSalaryPenalty =
    missingSalaryPenaltySetting.overrideValue;
  const missingSalaryPenalty = missingSalaryPenaltySetting.value;

  const autoSkipScoreThresholdSetting = resolveSettingValue(
    "autoSkipScoreThreshold",
    overrides.autoSkipScoreThreshold,
  );
  const defaultAutoSkipScoreThreshold =
    autoSkipScoreThresholdSetting.defaultValue;
  const overrideAutoSkipScoreThreshold =
    autoSkipScoreThresholdSetting.overrideValue;
  const autoSkipScoreThreshold = autoSkipScoreThresholdSetting.value;

  return {
    ...envSettings,
    model,
    defaultModel,
    overrideModel,
    modelScorer,
    overrideModelScorer,
    modelTailoring,
    overrideModelTailoring,
    modelProjectSelection,
    overrideModelProjectSelection,
    llmProvider,
    defaultLlmProvider,
    overrideLlmProvider,
    llmBaseUrl,
    defaultLlmBaseUrl,
    overrideLlmBaseUrl,
    pipelineWebhookUrl,
    defaultPipelineWebhookUrl,
    overridePipelineWebhookUrl,
    jobCompleteWebhookUrl,
    defaultJobCompleteWebhookUrl,
    overrideJobCompleteWebhookUrl,
    ...resumeProjectsData,
    rxresumeBaseResumeId,
    ukvisajobsMaxJobs,
    defaultUkvisajobsMaxJobs,
    overrideUkvisajobsMaxJobs,
    adzunaMaxJobsPerTerm,
    defaultAdzunaMaxJobsPerTerm,
    overrideAdzunaMaxJobsPerTerm,
    gradcrackerMaxJobsPerTerm,
    defaultGradcrackerMaxJobsPerTerm,
    overrideGradcrackerMaxJobsPerTerm,
    searchTerms,
    defaultSearchTerms,
    overrideSearchTerms,
    searchCities,
    defaultSearchCities,
    overrideSearchCities,
    jobspyResultsWanted,
    defaultJobspyResultsWanted,
    overrideJobspyResultsWanted,
    jobspyCountryIndeed,
    defaultJobspyCountryIndeed,
    overrideJobspyCountryIndeed,
    showSponsorInfo,
    defaultShowSponsorInfo,
    overrideShowSponsorInfo,
    chatStyleTone,
    defaultChatStyleTone,
    overrideChatStyleTone,
    chatStyleFormality,
    defaultChatStyleFormality,
    overrideChatStyleFormality,
    chatStyleConstraints,
    defaultChatStyleConstraints,
    overrideChatStyleConstraints,
    chatStyleDoNotUse,
    defaultChatStyleDoNotUse,
    overrideChatStyleDoNotUse,
    backupEnabled,
    defaultBackupEnabled,
    overrideBackupEnabled,
    backupHour,
    defaultBackupHour,
    overrideBackupHour,
    backupMaxCount,
    defaultBackupMaxCount,
    overrideBackupMaxCount,
    penalizeMissingSalary,
    defaultPenalizeMissingSalary,
    overridePenalizeMissingSalary,
    missingSalaryPenalty,
    defaultMissingSalaryPenalty,
    overrideMissingSalaryPenalty,
    autoSkipScoreThreshold,
    defaultAutoSkipScoreThreshold,
    overrideAutoSkipScoreThreshold,
  } as AppSettings;
}

function resolveDefaultLlmBaseUrl(provider: string): string {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "ollama") return "http://localhost:11434";
  if (normalized === "lmstudio") return "http://localhost:1234";
  if (normalized === "openai") {
    return "https://api.openai.com";
  }
  if (normalized === "gemini") {
    return "https://generativelanguage.googleapis.com";
  }
  return "https://openrouter.ai";
}
