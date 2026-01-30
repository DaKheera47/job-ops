import * as api from "@client/api";
import { PageHeader } from "@client/components/layout";
import { DangerZoneSection } from "@client/pages/settings/components/DangerZoneSection";
import { DisplaySettingsSection } from "@client/pages/settings/components/DisplaySettingsSection";
import { EnvironmentSettingsSection } from "@client/pages/settings/components/EnvironmentSettingsSection";
import { GradcrackerSection } from "@client/pages/settings/components/GradcrackerSection";
import { JobspySection } from "@client/pages/settings/components/JobspySection";
import { ModelSettingsSection } from "@client/pages/settings/components/ModelSettingsSection";
import { ReactiveResumeSection } from "@client/pages/settings/components/ReactiveResumeSection";
import { SearchTermsSection } from "@client/pages/settings/components/SearchTermsSection";
import { UkvisajobsSection } from "@client/pages/settings/components/UkvisajobsSection";
import { WebhooksSection } from "@client/pages/settings/components/WebhooksSection";
import {
  type LlmProviderId,
  normalizeLlmProvider,
  resumeProjectsEqual,
} from "@client/pages/settings/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  type UpdateSettingsInput,
  updateSettingsSchema,
} from "@shared/settings-schema";
import type {
  AppSettings,
  JobStatus,
  ResumeProjectCatalogItem,
  ResumeProjectsSettings,
} from "@shared/types";
import { Settings } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { FormProvider, type Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { arraysEqual } from "@/lib/utils";

const DEFAULT_FORM_VALUES: UpdateSettingsInput = {
  model: "",
  modelScorer: "",
  modelTailoring: "",
  modelProjectSelection: "",
  llmProvider: null,
  llmBaseUrl: "",
  llmApiKey: "",
  pipelineWebhookUrl: "",
  jobCompleteWebhookUrl: "",
  resumeProjects: null,
  rxresumeBaseResumeId: null,
  ukvisajobsMaxJobs: null,
  gradcrackerMaxJobsPerTerm: null,
  searchTerms: null,
  jobspyLocation: null,
  jobspyResultsWanted: null,
  jobspyHoursOld: null,
  jobspyCountryIndeed: null,
  jobspySites: null,
  jobspyLinkedinFetchDescription: null,
  jobspyIsRemote: null,
  showSponsorInfo: null,
  openrouterApiKey: "",
  rxresumeEmail: "",
  rxresumePassword: "",
  basicAuthUser: "",
  basicAuthPassword: "",
  ukvisajobsEmail: "",
  ukvisajobsPassword: "",
  webhookSecret: "",
  enableBasicAuth: false,
};

type LlmProviderValue = LlmProviderId | null;

const normalizeLlmProviderValue = (
  value: string | null | undefined,
): LlmProviderValue => (value ? normalizeLlmProvider(value) : null);

const NULL_SETTINGS_PAYLOAD: UpdateSettingsInput = {
  model: null,
  modelScorer: null,
  modelTailoring: null,
  modelProjectSelection: null,
  llmProvider: null,
  llmBaseUrl: null,
  llmApiKey: null,
  pipelineWebhookUrl: null,
  jobCompleteWebhookUrl: null,
  resumeProjects: null,
  rxresumeBaseResumeId: null,
  ukvisajobsMaxJobs: null,
  gradcrackerMaxJobsPerTerm: null,
  searchTerms: null,
  jobspyLocation: null,
  jobspyResultsWanted: null,
  jobspyHoursOld: null,
  jobspyCountryIndeed: null,
  jobspySites: null,
  jobspyLinkedinFetchDescription: null,
  jobspyIsRemote: null,
  showSponsorInfo: null,
  openrouterApiKey: null,
  rxresumeEmail: null,
  rxresumePassword: null,
  basicAuthUser: null,
  basicAuthPassword: null,
  ukvisajobsEmail: null,
  ukvisajobsPassword: null,
  webhookSecret: null,
  enableBasicAuth: undefined,
};

const mapSettingsToForm = (data: AppSettings): UpdateSettingsInput => ({
  model: data.overrideModel ?? "",
  modelScorer: data.overrideModelScorer ?? "",
  modelTailoring: data.overrideModelTailoring ?? "",
  modelProjectSelection: data.overrideModelProjectSelection ?? "",
  llmProvider: normalizeLlmProviderValue(data.overrideLlmProvider),
  llmBaseUrl: data.overrideLlmBaseUrl ?? "",
  llmApiKey: "",
  pipelineWebhookUrl: data.overridePipelineWebhookUrl ?? "",
  jobCompleteWebhookUrl: data.overrideJobCompleteWebhookUrl ?? "",
  resumeProjects: data.resumeProjects,
  rxresumeBaseResumeId: data.rxresumeBaseResumeId ?? null,
  ukvisajobsMaxJobs: data.overrideUkvisajobsMaxJobs,
  gradcrackerMaxJobsPerTerm: data.overrideGradcrackerMaxJobsPerTerm,
  searchTerms: data.overrideSearchTerms,
  jobspyLocation: data.overrideJobspyLocation,
  jobspyResultsWanted: data.overrideJobspyResultsWanted,
  jobspyHoursOld: data.overrideJobspyHoursOld,
  jobspyCountryIndeed: data.overrideJobspyCountryIndeed,
  jobspySites: data.overrideJobspySites,
  jobspyLinkedinFetchDescription: data.overrideJobspyLinkedinFetchDescription,
  jobspyIsRemote: data.overrideJobspyIsRemote,
  showSponsorInfo: data.overrideShowSponsorInfo,
  openrouterApiKey: "",
  rxresumeEmail: data.rxresumeEmail ?? "",
  rxresumePassword: "",
  basicAuthUser: data.basicAuthUser ?? "",
  basicAuthPassword: "",
  ukvisajobsEmail: data.ukvisajobsEmail ?? "",
  ukvisajobsPassword: "",
  webhookSecret: "",
  enableBasicAuth: data.basicAuthActive,
});

const normalizeString = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const normalizePrivateInput = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  if (trimmed === "") return null;
  return trimmed || undefined;
};

const isSameStringList = (
  left: string[] | null | undefined,
  right: string[] | null | undefined,
) => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return arraysEqual(left, right);
};

const isSameSortedStringList = (
  left: string[] | null | undefined,
  right: string[] | null | undefined,
) => {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return arraysEqual(left.slice().sort(), right.slice().sort());
};

const nullIfSame = <T,>(value: T | null | undefined, defaultValue: T) =>
  value === defaultValue ? null : (value ?? null);

const nullIfSameList = (
  value: string[] | null | undefined,
  defaultValue: string[],
) => (isSameStringList(value, defaultValue) ? null : (value ?? null));

const normalizeResumeProjectsForCatalog = (
  catalog: ResumeProjectCatalogItem[],
  current: ResumeProjectsSettings | null,
): ResumeProjectsSettings | null => {
  const allowed = new Set(catalog.map((project) => project.id));

  const base = current ?? {
    maxProjects: 0,
    lockedProjectIds: catalog
      .filter((project) => project.isVisibleInBase)
      .map((project) => project.id),
    aiSelectableProjectIds: [],
  };

  const lockedProjectIds = base.lockedProjectIds.filter((id) =>
    allowed.has(id),
  );
  const lockedSet = new Set(lockedProjectIds);
  const aiSelectableProjectIds = (
    current ? base.aiSelectableProjectIds : catalog.map((project) => project.id)
  )
    .filter((id) => allowed.has(id))
    .filter((id) => !lockedSet.has(id));
  const maxProjectsRaw = Number.isFinite(base.maxProjects)
    ? base.maxProjects
    : 0;
  const maxProjectsInt = Math.max(0, Math.floor(maxProjectsRaw));
  const maxProjects = Math.min(
    catalog.length,
    Math.max(lockedProjectIds.length, maxProjectsInt, 3),
  );
  return { maxProjects, lockedProjectIds, aiSelectableProjectIds };
};

const nullIfSameSortedList = (
  value: string[] | null | undefined,
  defaultValue: string[],
) => (isSameSortedStringList(value, defaultValue) ? null : (value ?? null));

const getDerivedSettings = (settings: AppSettings | null) => {
  const profileProjects = settings?.profileProjects ?? [];

  return {
    model: {
      effective: settings?.model ?? "",
      default: settings?.defaultModel ?? "",
      scorer: settings?.modelScorer ?? "",
      tailoring: settings?.modelTailoring ?? "",
      projectSelection: settings?.modelProjectSelection ?? "",
      llmProvider: settings?.llmProvider ?? "",
      llmBaseUrl: settings?.llmBaseUrl ?? "",
      llmApiKeyHint:
        settings?.llmApiKeyHint ?? settings?.openrouterApiKeyHint ?? null,
    },
    pipelineWebhook: {
      effective: settings?.pipelineWebhookUrl ?? "",
      default: settings?.defaultPipelineWebhookUrl ?? "",
    },
    jobCompleteWebhook: {
      effective: settings?.jobCompleteWebhookUrl ?? "",
      default: settings?.defaultJobCompleteWebhookUrl ?? "",
    },
    ukvisajobs: {
      effective: settings?.ukvisajobsMaxJobs ?? 50,
      default: settings?.defaultUkvisajobsMaxJobs ?? 50,
    },
    gradcracker: {
      effective: settings?.gradcrackerMaxJobsPerTerm ?? 50,
      default: settings?.defaultGradcrackerMaxJobsPerTerm ?? 50,
    },
    searchTerms: {
      effective: settings?.searchTerms ?? [],
      default: settings?.defaultSearchTerms ?? [],
    },
    jobspy: {
      location: {
        effective: settings?.jobspyLocation ?? "",
        default: settings?.defaultJobspyLocation ?? "",
      },
      resultsWanted: {
        effective: settings?.jobspyResultsWanted ?? 200,
        default: settings?.defaultJobspyResultsWanted ?? 200,
      },
      hoursOld: {
        effective: settings?.jobspyHoursOld ?? 72,
        default: settings?.defaultJobspyHoursOld ?? 72,
      },
      countryIndeed: {
        effective: settings?.jobspyCountryIndeed ?? "",
        default: settings?.defaultJobspyCountryIndeed ?? "",
      },
      sites: {
        effective: settings?.jobspySites ?? ["indeed", "linkedin"],
        default: settings?.defaultJobspySites ?? ["indeed", "linkedin"],
      },
      linkedinFetchDescription: {
        effective: settings?.jobspyLinkedinFetchDescription ?? true,
        default: settings?.defaultJobspyLinkedinFetchDescription ?? true,
      },
      isRemote: {
        effective: settings?.jobspyIsRemote ?? false,
        default: settings?.defaultJobspyIsRemote ?? false,
      },
    },
    display: {
      effective: settings?.showSponsorInfo ?? true,
      default: settings?.defaultShowSponsorInfo ?? true,
    },
    envSettings: {
      readable: {
        rxresumeEmail: settings?.rxresumeEmail ?? "",
        ukvisajobsEmail: settings?.ukvisajobsEmail ?? "",
        basicAuthUser: settings?.basicAuthUser ?? "",
      },
      private: {
        openrouterApiKeyHint: settings?.openrouterApiKeyHint ?? null,
        rxresumePasswordHint: settings?.rxresumePasswordHint ?? null,
        ukvisajobsPasswordHint: settings?.ukvisajobsPasswordHint ?? null,
        basicAuthPasswordHint: settings?.basicAuthPasswordHint ?? null,
        webhookSecretHint: settings?.webhookSecretHint ?? null,
      },
      basicAuthActive: settings?.basicAuthActive ?? false,
    },
    defaultResumeProjects: settings?.defaultResumeProjects ?? null,

    profileProjects,
    maxProjectsTotal: profileProjects.length,
  };
};

export const SettingsPage: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statusesToClear, setStatusesToClear] = useState<JobStatus[]>([
    "discovered",
  ]);
  const [rxResumeBaseResumeIdDraft, setRxResumeBaseResumeIdDraft] = useState<
    string | null
  >(null);
  const [rxResumeProjectsOverride, setRxResumeProjectsOverride] = useState<
    ResumeProjectCatalogItem[] | null
  >(null);
  const [isFetchingRxResumeProjects, setIsFetchingRxResumeProjects] =
    useState(false);

  const methods = useForm<UpdateSettingsInput>({
    resolver: zodResolver(
      updateSettingsSchema,
    ) as Resolver<UpdateSettingsInput>,
    mode: "onChange",
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const {
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    watch,
    formState: { isDirty, errors, isValid, dirtyFields },
  } = methods;

  const hasRxResumeAccess = Boolean(
    settings?.rxresumeEmail?.trim() && settings?.rxresumePasswordHint,
  );

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    api
      .getSettings()
      .then((data) => {
        if (!isMounted) return;
        setSettings(data);
        reset(mapSettingsToForm(data));
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Failed to load settings";
        toast.error(message);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [reset]);

  useEffect(() => {
    if (!settings) return;
    const storedId = settings.rxresumeBaseResumeId ?? null;
    setRxResumeBaseResumeIdDraft(storedId);
    setValue("rxresumeBaseResumeId", storedId, { shouldDirty: false });
    setRxResumeProjectsOverride(null);
  }, [settings, setValue]);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    if (!rxResumeBaseResumeIdDraft) {
      setRxResumeProjectsOverride(null);
      return () => {
        isMounted = false;
        controller.abort();
      };
    }

    if (!hasRxResumeAccess)
      return () => {
        isMounted = false;
        controller.abort();
      };

    setIsFetchingRxResumeProjects(true);
    api
      .getRxResumeProjects(rxResumeBaseResumeIdDraft, controller.signal)
      .then((projects) => {
        if (!isMounted) return;
        setRxResumeProjectsOverride(projects);
        const normalized = normalizeResumeProjectsForCatalog(
          projects,
          getValues("resumeProjects") ?? null,
        );
        if (normalized) {
          setValue("resumeProjects", normalized, { shouldDirty: true });
        }
      })
      .catch((error) => {
        if (!isMounted || error.name === "AbortError") return;
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load RxResume projects";
        toast.error(message);
        setRxResumeProjectsOverride(null);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsFetchingRxResumeProjects(false);
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [rxResumeBaseResumeIdDraft, hasRxResumeAccess, getValues, setValue]);

  const derived = getDerivedSettings(settings);
  const {
    model,
    pipelineWebhook,
    jobCompleteWebhook,
    ukvisajobs,
    gradcracker,
    searchTerms,
    jobspy,
    display,
    envSettings,
    defaultResumeProjects,
    profileProjects,
  } = derived;

  const effectiveProfileProjects = rxResumeProjectsOverride ?? profileProjects;
  const effectiveMaxProjectsTotal = effectiveProfileProjects.length;

  const watchedValues = watch();
  const lockedCount =
    watchedValues.resumeProjects?.lockedProjectIds.length ?? 0;

  const canSave = isDirty && isValid;

  const onSave = async (data: UpdateSettingsInput) => {
    if (!settings) return;
    if (data.enableBasicAuth && !settings.basicAuthActive) {
      const password = data.basicAuthPassword?.trim() ?? "";
      if (!password) {
        setError("basicAuthPassword", {
          type: "manual",
          message: "Password is required when basic auth is enabled",
        });
        return;
      }
    }
    try {
      setIsSaving(true);

      // Prepare payload: nullify if equal to default
      const resumeProjectsData = data.resumeProjects;
      const resumeProjectsOverride =
        resumeProjectsData &&
        defaultResumeProjects &&
        resumeProjectsEqual(resumeProjectsData, defaultResumeProjects)
          ? null
          : resumeProjectsData;

      const envPayload: Partial<UpdateSettingsInput> = {};

      if (dirtyFields.rxresumeEmail || dirtyFields.rxresumePassword) {
        envPayload.rxresumeEmail = normalizeString(data.rxresumeEmail);
      }

      if (dirtyFields.ukvisajobsEmail || dirtyFields.ukvisajobsPassword) {
        envPayload.ukvisajobsEmail = normalizeString(data.ukvisajobsEmail);
      }

      if (data.enableBasicAuth === false) {
        envPayload.basicAuthUser = null;
        envPayload.basicAuthPassword = null;
      } else if (
        dirtyFields.enableBasicAuth ||
        dirtyFields.basicAuthUser ||
        dirtyFields.basicAuthPassword
      ) {
        // If enabling basic auth or changing either field, ensure we send at least the username
        // to keep the pair consistent in the backend.
        envPayload.basicAuthUser = normalizeString(data.basicAuthUser);

        if (dirtyFields.basicAuthPassword) {
          const value = normalizePrivateInput(data.basicAuthPassword);
          if (value !== undefined) envPayload.basicAuthPassword = value;
        }
      }

      if (dirtyFields.openrouterApiKey) {
        const value = normalizePrivateInput(data.openrouterApiKey);
        if (value !== undefined) envPayload.openrouterApiKey = value;
      }

      if (dirtyFields.llmProvider) {
        envPayload.llmProvider = data.llmProvider ?? null;
      }

      if (dirtyFields.llmBaseUrl) {
        envPayload.llmBaseUrl = normalizeString(data.llmBaseUrl);
      }

      if (dirtyFields.llmApiKey) {
        const value = normalizePrivateInput(data.llmApiKey);
        if (value !== undefined) envPayload.llmApiKey = value;
      }

      if (dirtyFields.rxresumePassword) {
        const value = normalizePrivateInput(data.rxresumePassword);
        if (value !== undefined) envPayload.rxresumePassword = value;
      }

      if (dirtyFields.ukvisajobsPassword) {
        const value = normalizePrivateInput(data.ukvisajobsPassword);
        if (value !== undefined) envPayload.ukvisajobsPassword = value;
      }

      if (dirtyFields.webhookSecret) {
        const value = normalizePrivateInput(data.webhookSecret);
        if (value !== undefined) envPayload.webhookSecret = value;
      }

      const payload: UpdateSettingsInput = {
        model: normalizeString(data.model),
        modelScorer: normalizeString(data.modelScorer),
        modelTailoring: normalizeString(data.modelTailoring),
        modelProjectSelection: normalizeString(data.modelProjectSelection),
        pipelineWebhookUrl: normalizeString(data.pipelineWebhookUrl),
        jobCompleteWebhookUrl: normalizeString(data.jobCompleteWebhookUrl),
        resumeProjects: resumeProjectsOverride,
        rxresumeBaseResumeId: normalizeString(data.rxresumeBaseResumeId),
        ukvisajobsMaxJobs: nullIfSame(
          data.ukvisajobsMaxJobs,
          ukvisajobs.default,
        ),
        gradcrackerMaxJobsPerTerm: nullIfSame(
          data.gradcrackerMaxJobsPerTerm,
          gradcracker.default,
        ),
        searchTerms: nullIfSameList(data.searchTerms, searchTerms.default),
        jobspyLocation: nullIfSame(
          data.jobspyLocation,
          jobspy.location.default,
        ),
        jobspyResultsWanted: nullIfSame(
          data.jobspyResultsWanted,
          jobspy.resultsWanted.default,
        ),
        jobspyHoursOld: nullIfSame(
          data.jobspyHoursOld,
          jobspy.hoursOld.default,
        ),
        jobspyCountryIndeed: nullIfSame(
          data.jobspyCountryIndeed,
          jobspy.countryIndeed.default,
        ),
        jobspySites: nullIfSameSortedList(
          data.jobspySites,
          jobspy.sites.default,
        ),
        jobspyLinkedinFetchDescription: nullIfSame(
          data.jobspyLinkedinFetchDescription,
          jobspy.linkedinFetchDescription.default,
        ),
        jobspyIsRemote: nullIfSame(
          data.jobspyIsRemote,
          jobspy.isRemote.default,
        ),
        showSponsorInfo: nullIfSame(data.showSponsorInfo, display.default),
        ...envPayload,
      };

      // Remove virtual field because the backend doesn't expect it
      // this exists only to toggle the UI
      // need to track it so that the save button is enabled when it changes
      delete payload.enableBasicAuth;

      const updated = await api.updateSettings(payload);
      setSettings(updated);
      reset(mapSettingsToForm(updated));
      toast.success("Settings saved");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save settings";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearDatabase = async () => {
    try {
      setIsSaving(true);
      const result = await api.clearDatabase();
      toast.success("Database cleared", {
        description: `Deleted ${result.jobsDeleted} jobs.`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clear database";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearByStatuses = async () => {
    if (statusesToClear.length === 0) {
      toast.error("No statuses selected");
      return;
    }
    try {
      setIsSaving(true);
      let totalDeleted = 0;
      const results: string[] = [];

      for (const status of statusesToClear) {
        const result = await api.deleteJobsByStatus(status);
        totalDeleted += result.count;
        if (result.count > 0) {
          results.push(`${result.count} ${status}`);
        }
      }

      if (totalDeleted > 0) {
        toast.success("Jobs cleared", {
          description: `Deleted ${totalDeleted} jobs: ${results.join(", ")}`,
        });
      } else {
        toast.info("No jobs found", {
          description: `No jobs with selected statuses found`,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clear jobs";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatusToClear = (status: JobStatus) => {
    setStatusesToClear((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  };
  const handleReset = async () => {
    try {
      setIsSaving(true);
      const updated = await api.updateSettings(NULL_SETTINGS_PAYLOAD);
      setSettings(updated);
      reset(mapSettingsToForm(updated));
      toast.success("Reset to default");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to reset settings";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <FormProvider {...methods}>
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Configure runtime behavior for this app."
      />

      <main className="container mx-auto max-w-3xl space-y-6 px-4 py-6 pb-12">
        <Accordion type="multiple" className="w-full space-y-4">
          <ModelSettingsSection
            values={model}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <WebhooksSection
            pipelineWebhook={pipelineWebhook}
            jobCompleteWebhook={jobCompleteWebhook}
            webhookSecretHint={envSettings.private.webhookSecretHint}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <UkvisajobsSection
            values={ukvisajobs}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <GradcrackerSection
            values={gradcracker}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <SearchTermsSection
            values={searchTerms}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <JobspySection
            values={jobspy}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <ReactiveResumeSection
            rxResumeBaseResumeIdDraft={rxResumeBaseResumeIdDraft}
            setRxResumeBaseResumeIdDraft={(value) => {
              setRxResumeBaseResumeIdDraft(value);
              setValue("rxresumeBaseResumeId", value, { shouldDirty: true });
            }}
            hasRxResumeAccess={hasRxResumeAccess}
            profileProjects={effectiveProfileProjects}
            lockedCount={lockedCount}
            maxProjectsTotal={effectiveMaxProjectsTotal}
            isProjectsLoading={isFetchingRxResumeProjects}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <DisplaySettingsSection
            values={display}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <EnvironmentSettingsSection
            values={envSettings}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <DangerZoneSection
            statusesToClear={statusesToClear}
            toggleStatusToClear={toggleStatusToClear}
            handleClearByStatuses={handleClearByStatuses}
            handleClearDatabase={handleClearDatabase}
            isLoading={isLoading}
            isSaving={isSaving}
          />
        </Accordion>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={handleSubmit(onSave)}
            disabled={isLoading || isSaving || !canSave}
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isLoading || isSaving || !settings}
          >
            Reset to default
          </Button>
        </div>
        {Object.keys(errors).length > 0 && (
          <div className="text-destructive text-sm mt-2">
            Please fix the errors before saving.
          </div>
        )}
      </main>
    </FormProvider>
  );
};
