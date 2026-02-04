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

  const jobspyLocationSetting = resolveSettingValue(
    "jobspyLocation",
    overrides.jobspyLocation,
  );
  const defaultJobspyLocation = jobspyLocationSetting.defaultValue;
  const overrideJobspyLocation = jobspyLocationSetting.overrideValue;
  const jobspyLocation = jobspyLocationSetting.value;

  const jobspyResultsWantedSetting = resolveSettingValue(
    "jobspyResultsWanted",
    overrides.jobspyResultsWanted,
  );
  const defaultJobspyResultsWanted = jobspyResultsWantedSetting.defaultValue;
  const overrideJobspyResultsWanted = jobspyResultsWantedSetting.overrideValue;
  const jobspyResultsWanted = jobspyResultsWantedSetting.value;

  const jobspyHoursOldSetting = resolveSettingValue(
    "jobspyHoursOld",
    overrides.jobspyHoursOld,
  );
  const defaultJobspyHoursOld = jobspyHoursOldSetting.defaultValue;
  const overrideJobspyHoursOld = jobspyHoursOldSetting.overrideValue;
  const jobspyHoursOld = jobspyHoursOldSetting.value;

  const jobspyCountryIndeedSetting = resolveSettingValue(
    "jobspyCountryIndeed",
    overrides.jobspyCountryIndeed,
  );
  const defaultJobspyCountryIndeed = jobspyCountryIndeedSetting.defaultValue;
  const overrideJobspyCountryIndeed = jobspyCountryIndeedSetting.overrideValue;
  const jobspyCountryIndeed = jobspyCountryIndeedSetting.value;

  const jobspySitesSetting = resolveSettingValue(
    "jobspySites",
    overrides.jobspySites,
  );
  const defaultJobspySites = jobspySitesSetting.defaultValue;
  const overrideJobspySites = jobspySitesSetting.overrideValue;
  const jobspySites = jobspySitesSetting.value;

  const jobspyLinkedinFetchDescriptionSetting = resolveSettingValue(
    "jobspyLinkedinFetchDescription",
    overrides.jobspyLinkedinFetchDescription,
  );
  const defaultJobspyLinkedinFetchDescription =
    jobspyLinkedinFetchDescriptionSetting.defaultValue;
  const overrideJobspyLinkedinFetchDescription =
    jobspyLinkedinFetchDescriptionSetting.overrideValue;
  const jobspyLinkedinFetchDescription =
    jobspyLinkedinFetchDescriptionSetting.value;

  const jobspyIsRemoteSetting = resolveSettingValue(
    "jobspyIsRemote",
    overrides.jobspyIsRemote,
  );
  const defaultJobspyIsRemote = jobspyIsRemoteSetting.defaultValue;
  const overrideJobspyIsRemote = jobspyIsRemoteSetting.overrideValue;
  const jobspyIsRemote = jobspyIsRemoteSetting.value;

  const showSponsorInfoSetting = resolveSettingValue(
    "showSponsorInfo",
    overrides.showSponsorInfo,
  );
  const defaultShowSponsorInfo = showSponsorInfoSetting.defaultValue;
  const overrideShowSponsorInfo = showSponsorInfoSetting.overrideValue;
  const showSponsorInfo = showSponsorInfoSetting.value;

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
    gradcrackerMaxJobsPerTerm,
    defaultGradcrackerMaxJobsPerTerm,
    overrideGradcrackerMaxJobsPerTerm,
    searchTerms,
    defaultSearchTerms,
    overrideSearchTerms,
    jobspyLocation,
    defaultJobspyLocation,
    overrideJobspyLocation,
    jobspyResultsWanted,
    defaultJobspyResultsWanted,
    overrideJobspyResultsWanted,
    jobspyHoursOld,
    defaultJobspyHoursOld,
    overrideJobspyHoursOld,
    jobspyCountryIndeed,
    defaultJobspyCountryIndeed,
    overrideJobspyCountryIndeed,
    jobspySites,
    defaultJobspySites,
    overrideJobspySites,
    jobspyLinkedinFetchDescription,
    defaultJobspyLinkedinFetchDescription,
    overrideJobspyLinkedinFetchDescription,
    jobspyIsRemote,
    defaultJobspyIsRemote,
    overrideJobspyIsRemote,
    showSponsorInfo,
    defaultShowSponsorInfo,
    overrideShowSponsorInfo,
    backupEnabled,
    defaultBackupEnabled,
    overrideBackupEnabled,
    backupHour,
    defaultBackupHour,
    overrideBackupHour,
    backupMaxCount,
    defaultBackupMaxCount,
    overrideBackupMaxCount,
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
