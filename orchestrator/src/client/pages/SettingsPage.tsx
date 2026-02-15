import * as api from "@client/api";
import { PageHeader } from "@client/components/layout";
import { BackupSettingsSection } from "@client/pages/settings/components/BackupSettingsSection";
import { ChatSettingsSection } from "@client/pages/settings/components/ChatSettingsSection";
import { DangerZoneSection } from "@client/pages/settings/components/DangerZoneSection";
import { DisplaySettingsSection } from "@client/pages/settings/components/DisplaySettingsSection";
import { EnvironmentSettingsSection } from "@client/pages/settings/components/EnvironmentSettingsSection";
import { ModelSettingsSection } from "@client/pages/settings/components/ModelSettingsSection";
import { ReactiveResumeSection } from "@client/pages/settings/components/ReactiveResumeSection";
import { ScoringSettingsSection } from "@client/pages/settings/components/ScoringSettingsSection";
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
} from "@shared/settings-schema.js";
import type {
  AppSettings,
  BackupInfo,
  JobStatus,
  ResumeProjectCatalogItem,
  ResumeProjectsSettings,
} from "@shared/types.js";
import { Settings } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { FormProvider, type Resolver, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Accordion } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

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
  showSponsorInfo: null,
  chatStyleTone: "",
  chatStyleFormality: "",
  chatStyleConstraints: "",
  chatStyleDoNotUse: "",
  rxresumeEmail: "",
  rxresumePassword: "",
  basicAuthUser: "",
  basicAuthPassword: "",
  ukvisajobsEmail: "",
  ukvisajobsPassword: "",
  webhookSecret: "",
  enableBasicAuth: false,
  backupEnabled: null,
  backupHour: null,
  backupMaxCount: null,
  penalizeMissingSalary: null,
  missingSalaryPenalty: null,
  autoSkipScoreThreshold: null,
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
  showSponsorInfo: null,
  chatStyleTone: null,
  chatStyleFormality: null,
  chatStyleConstraints: null,
  chatStyleDoNotUse: null,
  rxresumeEmail: null,
  rxresumePassword: null,
  basicAuthUser: null,
  basicAuthPassword: null,
  ukvisajobsEmail: null,
  ukvisajobsPassword: null,
  webhookSecret: null,
  enableBasicAuth: undefined,
  backupEnabled: null,
  backupHour: null,
  backupMaxCount: null,
  penalizeMissingSalary: null,
  missingSalaryPenalty: null,
  autoSkipScoreThreshold: null,
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
  showSponsorInfo: data.overrideShowSponsorInfo,
  chatStyleTone: data.overrideChatStyleTone ?? "",
  chatStyleFormality: data.overrideChatStyleFormality ?? "",
  chatStyleConstraints: data.overrideChatStyleConstraints ?? "",
  chatStyleDoNotUse: data.overrideChatStyleDoNotUse ?? "",
  rxresumeEmail: data.rxresumeEmail ?? "",
  rxresumePassword: "",
  basicAuthUser: data.basicAuthUser ?? "",
  basicAuthPassword: "",
  ukvisajobsEmail: data.ukvisajobsEmail ?? "",
  ukvisajobsPassword: "",
  webhookSecret: "",
  enableBasicAuth: data.basicAuthActive,
  backupEnabled: data.overrideBackupEnabled,
  backupHour: data.overrideBackupHour,
  backupMaxCount: data.overrideBackupMaxCount,
  penalizeMissingSalary: data.overridePenalizeMissingSalary,
  missingSalaryPenalty: data.overrideMissingSalaryPenalty,
  autoSkipScoreThreshold: data.overrideAutoSkipScoreThreshold,
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

const nullIfSame = <T,>(value: T | null | undefined, defaultValue: T) =>
  value === defaultValue ? null : (value ?? null);

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
      llmApiKeyHint: settings?.llmApiKeyHint ?? null,
    },
    pipelineWebhook: {
      effective: settings?.pipelineWebhookUrl ?? "",
      default: settings?.defaultPipelineWebhookUrl ?? "",
    },
    jobCompleteWebhook: {
      effective: settings?.jobCompleteWebhookUrl ?? "",
      default: settings?.defaultJobCompleteWebhookUrl ?? "",
    },
    display: {
      effective: settings?.showSponsorInfo ?? true,
      default: settings?.defaultShowSponsorInfo ?? true,
    },
    chat: {
      tone: {
        effective: settings?.chatStyleTone ?? "professional",
        default: settings?.defaultChatStyleTone ?? "professional",
      },
      formality: {
        effective: settings?.chatStyleFormality ?? "medium",
        default: settings?.defaultChatStyleFormality ?? "medium",
      },
      constraints: {
        effective: settings?.chatStyleConstraints ?? "",
        default: settings?.defaultChatStyleConstraints ?? "",
      },
      doNotUse: {
        effective: settings?.chatStyleDoNotUse ?? "",
        default: settings?.defaultChatStyleDoNotUse ?? "",
      },
    },
    envSettings: {
      readable: {
        rxresumeEmail: settings?.rxresumeEmail ?? "",
        ukvisajobsEmail: settings?.ukvisajobsEmail ?? "",
        basicAuthUser: settings?.basicAuthUser ?? "",
      },
      private: {
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

    backup: {
      backupEnabled: {
        effective: settings?.backupEnabled ?? false,
        default: settings?.defaultBackupEnabled ?? false,
      },
      backupHour: {
        effective: settings?.backupHour ?? 2,
        default: settings?.defaultBackupHour ?? 2,
      },
      backupMaxCount: {
        effective: settings?.backupMaxCount ?? 5,
        default: settings?.defaultBackupMaxCount ?? 5,
      },
    },
    scoring: {
      penalizeMissingSalary: {
        effective: settings?.penalizeMissingSalary ?? false,
        default: settings?.defaultPenalizeMissingSalary ?? false,
      },
      missingSalaryPenalty: {
        effective: settings?.missingSalaryPenalty ?? 10,
        default: settings?.defaultMissingSalaryPenalty ?? 10,
      },
      autoSkipScoreThreshold: {
        effective: settings?.autoSkipScoreThreshold ?? null,
        default: settings?.defaultAutoSkipScoreThreshold ?? null,
      },
    },
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

  // Backup state
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [nextScheduled, setNextScheduled] = useState<string | null>(null);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isDeletingBackup, setIsDeletingBackup] = useState(false);

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
    display,
    chat,
    envSettings,
    defaultResumeProjects,
    profileProjects,
    backup,
    scoring,
  } = derived;

  // Backup functions
  const loadBackups = useCallback(async () => {
    setIsLoadingBackups(true);
    try {
      const response = await api.getBackups();
      setBackups(response.backups);
      setNextScheduled(response.nextScheduled);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load backups";
      toast.error(message);
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      await api.createManualBackup();
      toast.success("Backup created successfully");
      await loadBackups();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create backup";
      toast.error(message);
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    const confirmed = window.confirm(
      `Delete backup "${filename}"? This action cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }
    setIsDeletingBackup(true);
    try {
      await api.deleteBackup(filename);
      toast.success("Backup deleted successfully");
      await loadBackups();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete backup";
      toast.error(message);
    } finally {
      setIsDeletingBackup(false);
    }
  };

  // Load backups when settings are loaded
  useEffect(() => {
    if (settings) {
      loadBackups();
    }
  }, [settings, loadBackups]);

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
        showSponsorInfo: nullIfSame(data.showSponsorInfo, display.default),
        chatStyleTone: normalizeString(data.chatStyleTone),
        chatStyleFormality: normalizeString(data.chatStyleFormality),
        chatStyleConstraints: normalizeString(data.chatStyleConstraints),
        chatStyleDoNotUse: normalizeString(data.chatStyleDoNotUse),
        backupEnabled: nullIfSame(
          data.backupEnabled,
          backup.backupEnabled.default,
        ),
        backupHour: nullIfSame(data.backupHour, backup.backupHour.default),
        backupMaxCount: nullIfSame(
          data.backupMaxCount,
          backup.backupMaxCount.default,
        ),
        penalizeMissingSalary: nullIfSame(
          data.penalizeMissingSalary,
          scoring.penalizeMissingSalary.default,
        ),
        missingSalaryPenalty: nullIfSame(
          data.missingSalaryPenalty,
          scoring.missingSalaryPenalty.default,
        ),
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

  const handleClearByScore = async (threshold: number) => {
    try {
      setIsSaving(true);
      const result = await api.deleteJobsBelowScore(threshold);

      if (result.count > 0) {
        toast.success("Jobs cleared", {
          description: `Deleted ${result.count} jobs with score below ${threshold}. Applied jobs were preserved.`,
        });
      } else {
        toast.info("No jobs found", {
          description: `No jobs with score below ${threshold} found`,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to clear jobs by score";
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
          <ChatSettingsSection
            values={chat}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <ScoringSettingsSection
            values={scoring}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <EnvironmentSettingsSection
            values={envSettings}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <BackupSettingsSection
            values={backup}
            backups={backups}
            nextScheduled={nextScheduled}
            isLoading={isLoading || isLoadingBackups}
            isSaving={isSaving}
            onCreateBackup={handleCreateBackup}
            onDeleteBackup={handleDeleteBackup}
            isCreatingBackup={isCreatingBackup}
            isDeletingBackup={isDeletingBackup}
          />
          <DangerZoneSection
            statusesToClear={statusesToClear}
            toggleStatusToClear={toggleStatusToClear}
            handleClearByStatuses={handleClearByStatuses}
            handleClearDatabase={handleClearDatabase}
            handleClearByScore={handleClearByScore}
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
