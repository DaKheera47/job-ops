import * as settingsRepo from "@server/repositories/settings.js";
import type { AppSettings } from "@shared/types.js";
import { getEnvSettingsData } from "./envSettings.js";
import { getProfile } from "./profile.js";
import {
  extractProjectsFromProfile,
  resolveResumeProjectsSettings,
} from "./resumeProjects.js";
import { getResume, RxResumeCredentialsError } from "./rxresume-v4.js";

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

  const defaultUkvisajobsMaxJobs = 50;
  const overrideUkvisajobsMaxJobsRaw = overrides.ukvisajobsMaxJobs;
  const overrideUkvisajobsMaxJobs = overrideUkvisajobsMaxJobsRaw
    ? parseInt(overrideUkvisajobsMaxJobsRaw, 10)
    : null;
  const ukvisajobsMaxJobs =
    overrideUkvisajobsMaxJobs ?? defaultUkvisajobsMaxJobs;

  const defaultGradcrackerMaxJobsPerTerm = 50;
  const overrideGradcrackerMaxJobsPerTermRaw =
    overrides.gradcrackerMaxJobsPerTerm;
  const overrideGradcrackerMaxJobsPerTerm = overrideGradcrackerMaxJobsPerTermRaw
    ? parseInt(overrideGradcrackerMaxJobsPerTermRaw, 10)
    : null;
  const gradcrackerMaxJobsPerTerm =
    overrideGradcrackerMaxJobsPerTerm ?? defaultGradcrackerMaxJobsPerTerm;

  const defaultSearchTermsEnv =
    process.env.JOBSPY_SEARCH_TERMS || "web developer";
  const defaultSearchTerms = defaultSearchTermsEnv
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const overrideSearchTermsRaw = overrides.searchTerms;
  const overrideSearchTerms = overrideSearchTermsRaw
    ? (JSON.parse(overrideSearchTermsRaw) as string[])
    : null;
  const searchTerms = overrideSearchTerms ?? defaultSearchTerms;

  const defaultJobspyLocation = process.env.JOBSPY_LOCATION || "UK";
  const overrideJobspyLocation = overrides.jobspyLocation ?? null;
  const jobspyLocation = overrideJobspyLocation || defaultJobspyLocation;

  const defaultJobspyResultsWanted = parseInt(
    process.env.JOBSPY_RESULTS_WANTED || "200",
    10,
  );
  const overrideJobspyResultsWantedRaw = overrides.jobspyResultsWanted;
  const overrideJobspyResultsWanted = overrideJobspyResultsWantedRaw
    ? parseInt(overrideJobspyResultsWantedRaw, 10)
    : null;
  const jobspyResultsWanted =
    overrideJobspyResultsWanted ?? defaultJobspyResultsWanted;

  const defaultJobspyHoursOld = parseInt(
    process.env.JOBSPY_HOURS_OLD || "72",
    10,
  );
  const overrideJobspyHoursOldRaw = overrides.jobspyHoursOld;
  const overrideJobspyHoursOld = overrideJobspyHoursOldRaw
    ? parseInt(overrideJobspyHoursOldRaw, 10)
    : null;
  const jobspyHoursOld = overrideJobspyHoursOld ?? defaultJobspyHoursOld;

  const defaultJobspyCountryIndeed = process.env.JOBSPY_COUNTRY_INDEED || "UK";
  const overrideJobspyCountryIndeed = overrides.jobspyCountryIndeed ?? null;
  const jobspyCountryIndeed =
    overrideJobspyCountryIndeed || defaultJobspyCountryIndeed;

  const defaultJobspySites = (process.env.JOBSPY_SITES || "indeed,linkedin")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const overrideJobspySitesRaw = overrides.jobspySites;
  const overrideJobspySites = overrideJobspySitesRaw
    ? (JSON.parse(overrideJobspySitesRaw) as string[])
    : null;
  const jobspySites = overrideJobspySites ?? defaultJobspySites;

  const defaultJobspyLinkedinFetchDescription =
    (process.env.JOBSPY_LINKEDIN_FETCH_DESCRIPTION || "1") === "1";
  const overrideJobspyLinkedinFetchDescriptionRaw =
    overrides.jobspyLinkedinFetchDescription;
  const overrideJobspyLinkedinFetchDescription =
    overrideJobspyLinkedinFetchDescriptionRaw
      ? overrideJobspyLinkedinFetchDescriptionRaw === "true" ||
        overrideJobspyLinkedinFetchDescriptionRaw === "1"
      : null;
  const jobspyLinkedinFetchDescription =
    overrideJobspyLinkedinFetchDescription ??
    defaultJobspyLinkedinFetchDescription;

  const defaultJobspyIsRemote = (process.env.JOBSPY_IS_REMOTE || "0") === "1";
  const overrideJobspyIsRemoteRaw = overrides.jobspyIsRemote;
  const overrideJobspyIsRemote = overrideJobspyIsRemoteRaw
    ? overrideJobspyIsRemoteRaw === "true" || overrideJobspyIsRemoteRaw === "1"
    : null;
  const jobspyIsRemote = overrideJobspyIsRemote ?? defaultJobspyIsRemote;

  const defaultShowSponsorInfo = true;
  const overrideShowSponsorInfoRaw = overrides.showSponsorInfo;
  const overrideShowSponsorInfo = overrideShowSponsorInfoRaw
    ? overrideShowSponsorInfoRaw === "true" ||
      overrideShowSponsorInfoRaw === "1"
    : null;
  const showSponsorInfo = overrideShowSponsorInfo ?? defaultShowSponsorInfo;

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
