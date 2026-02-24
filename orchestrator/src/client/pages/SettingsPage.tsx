import * as api from "@client/api";
import { PageHeader } from "@client/components/layout";
import { useUpdateSettingsMutation } from "@client/hooks/queries/useSettingsMutation";
import { useRxResumeConfigState } from "@client/hooks/useRxResumeConfigState";
import { useTracerReadiness } from "@client/hooks/useTracerReadiness";
import {
  coerceRxResumeMode,
  getRxResumeCredentialDrafts,
  RXRESUME_MODES,
  RXRESUME_PRECHECK_MESSAGES,
  validateAndMaybePersistRxResumeMode,
} from "@client/lib/rxresume-config";
import { BackupSettingsSection } from "@client/pages/settings/components/BackupSettingsSection";
import { ChatSettingsSection } from "@client/pages/settings/components/ChatSettingsSection";
import { DangerZoneSection } from "@client/pages/settings/components/DangerZoneSection";
import { DisplaySettingsSection } from "@client/pages/settings/components/DisplaySettingsSection";
import { EnvironmentSettingsSection } from "@client/pages/settings/components/EnvironmentSettingsSection";
import { ModelSettingsSection } from "@client/pages/settings/components/ModelSettingsSection";
import { ReactiveResumeSection } from "@client/pages/settings/components/ReactiveResumeSection";
import { ScoringSettingsSection } from "@client/pages/settings/components/ScoringSettingsSection";
import { TracerLinksSettingsSection } from "@client/pages/settings/components/TracerLinksSettingsSection";
import { WebhooksSection } from "@client/pages/settings/components/WebhooksSection";
import {
  type LlmProviderId,
  normalizeLlmProvider,
  resumeProjectsEqual,
} from "@client/pages/settings/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { normalizeStringArray } from "@shared/normalize-string-array.js";
import {
  type UpdateSettingsInput,
  updateSettingsSchema,
} from "@shared/settings-schema.js";
import type {
  AppSettings,
  JobStatus,
  ResumeProjectCatalogItem,
  ResumeProjectsSettings,
  RxResumeMode,
} from "@shared/types.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  FormProvider,
  type Resolver,
  useForm,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { queryKeys } from "@/client/lib/queryKeys";
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
  rxresumeMode: "v5",
  rxresumeBaseResumeId: null,
  showSponsorInfo: null,
  chatStyleTone: "",
  chatStyleFormality: "",
  chatStyleConstraints: "",
  chatStyleDoNotUse: "",
  rxresumeEmail: "",
  rxresumePassword: "",
  rxresumeApiKey: "",
  basicAuthUser: "",
  basicAuthPassword: "",
  ukvisajobsEmail: "",
  ukvisajobsPassword: "",
  adzunaAppId: "",
  adzunaAppKey: "",
  webhookSecret: "",
  enableBasicAuth: false,
  backupEnabled: null,
  backupHour: null,
  backupMaxCount: null,
  penalizeMissingSalary: null,
  missingSalaryPenalty: null,
  autoSkipScoreThreshold: null,
  blockedCompanyKeywords: [],
};

type LlmProviderValue = LlmProviderId | null;
type RxResumeValidationBadgeState = {
  checked: boolean;
  valid: boolean;
  message: string | null;
};
const EMPTY_RXRESUME_VALIDATION_BADGE_STATE: RxResumeValidationBadgeState = {
  checked: false,
  valid: false,
  message: null,
};

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
  rxresumeMode: null,
  rxresumeBaseResumeId: null,
  showSponsorInfo: null,
  chatStyleTone: null,
  chatStyleFormality: null,
  chatStyleConstraints: null,
  chatStyleDoNotUse: null,
  rxresumeEmail: null,
  rxresumePassword: null,
  rxresumeApiKey: null,
  basicAuthUser: null,
  basicAuthPassword: null,
  ukvisajobsEmail: null,
  ukvisajobsPassword: null,
  adzunaAppId: null,
  adzunaAppKey: null,
  adzunaMaxJobsPerTerm: null,
  webhookSecret: null,
  enableBasicAuth: undefined,
  backupEnabled: null,
  backupHour: null,
  backupMaxCount: null,
  penalizeMissingSalary: null,
  missingSalaryPenalty: null,
  autoSkipScoreThreshold: null,
  blockedCompanyKeywords: null,
};

const mapSettingsToForm = (data: AppSettings): UpdateSettingsInput => ({
  model: data.model.override ?? "",
  modelScorer: data.modelScorer.override ?? "",
  modelTailoring: data.modelTailoring.override ?? "",
  modelProjectSelection: data.modelProjectSelection.override ?? "",
  llmProvider: normalizeLlmProviderValue(data.llmProvider.override),
  llmBaseUrl: data.llmBaseUrl.override ?? "",
  llmApiKey: "",
  pipelineWebhookUrl: data.pipelineWebhookUrl.override ?? "",
  jobCompleteWebhookUrl: data.jobCompleteWebhookUrl.override ?? "",
  resumeProjects: data.resumeProjects.override,
  rxresumeMode: data.rxresumeMode.override ?? data.rxresumeMode.value,
  rxresumeBaseResumeId: data.rxresumeBaseResumeId,
  showSponsorInfo: data.showSponsorInfo.override,
  chatStyleTone: data.chatStyleTone.override ?? "",
  chatStyleFormality: data.chatStyleFormality.override ?? "",
  chatStyleConstraints: data.chatStyleConstraints.override ?? "",
  chatStyleDoNotUse: data.chatStyleDoNotUse.override ?? "",
  rxresumeEmail: data.rxresumeEmail ?? "",
  rxresumePassword: "",
  rxresumeApiKey: "",
  basicAuthUser: data.basicAuthUser ?? "",
  basicAuthPassword: "",
  ukvisajobsEmail: data.ukvisajobsEmail ?? "",
  ukvisajobsPassword: "",
  adzunaAppId: data.adzunaAppId ?? "",
  adzunaAppKey: "",
  webhookSecret: "",
  enableBasicAuth: data.basicAuthActive,
  backupEnabled: data.backupEnabled.override,
  backupHour: data.backupHour.override,
  backupMaxCount: data.backupMaxCount.override,
  penalizeMissingSalary: data.penalizeMissingSalary.override,
  missingSalaryPenalty: data.missingSalaryPenalty.override,
  autoSkipScoreThreshold: data.autoSkipScoreThreshold.override,
  blockedCompanyKeywords: data.blockedCompanyKeywords.override ?? [],
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

const stringArraysEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
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
      effective: settings?.model?.value ?? "",
      default: settings?.model?.default ?? "",
      scorer: settings?.modelScorer?.value ?? "",
      tailoring: settings?.modelTailoring?.value ?? "",
      projectSelection: settings?.modelProjectSelection?.value ?? "",
      llmProvider: settings?.llmProvider?.value ?? "",
      llmBaseUrl: settings?.llmBaseUrl?.value ?? "",
      llmApiKeyHint: settings?.llmApiKeyHint ?? null,
    },
    pipelineWebhook: {
      effective: settings?.pipelineWebhookUrl?.value ?? "",
      default: settings?.pipelineWebhookUrl?.default ?? "",
    },
    jobCompleteWebhook: {
      effective: settings?.jobCompleteWebhookUrl?.value ?? "",
      default: settings?.jobCompleteWebhookUrl?.default ?? "",
    },
    display: {
      effective: settings?.showSponsorInfo?.value ?? true,
      default: settings?.showSponsorInfo?.default ?? true,
    },
    chat: {
      tone: {
        effective: settings?.chatStyleTone?.value ?? "professional",
        default: settings?.chatStyleTone?.default ?? "professional",
      },
      formality: {
        effective: settings?.chatStyleFormality?.value ?? "medium",
        default: settings?.chatStyleFormality?.default ?? "medium",
      },
      constraints: {
        effective: settings?.chatStyleConstraints?.value ?? "",
        default: settings?.chatStyleConstraints?.default ?? "",
      },
      doNotUse: {
        effective: settings?.chatStyleDoNotUse?.value ?? "",
        default: settings?.chatStyleDoNotUse?.default ?? "",
      },
    },
    envSettings: {
      readable: {
        rxresumeEmail: settings?.rxresumeEmail ?? "",
        ukvisajobsEmail: settings?.ukvisajobsEmail ?? "",
        adzunaAppId: settings?.adzunaAppId ?? "",
        basicAuthUser: settings?.basicAuthUser ?? "",
      },
      private: {
        rxresumePasswordHint: settings?.rxresumePasswordHint ?? null,
        ukvisajobsPasswordHint: settings?.ukvisajobsPasswordHint ?? null,
        adzunaAppKeyHint: settings?.adzunaAppKeyHint ?? null,
        basicAuthPasswordHint: settings?.basicAuthPasswordHint ?? null,
        webhookSecretHint: settings?.webhookSecretHint ?? null,
      },
      basicAuthActive: settings?.basicAuthActive ?? false,
    },
    defaultResumeProjects: settings?.resumeProjects?.default ?? null,

    profileProjects,
    maxProjectsTotal: profileProjects.length,

    backup: {
      backupEnabled: {
        effective: settings?.backupEnabled?.value ?? false,
        default: settings?.backupEnabled?.default ?? false,
      },
      backupHour: {
        effective: settings?.backupHour?.value ?? 2,
        default: settings?.backupHour?.default ?? 2,
      },
      backupMaxCount: {
        effective: settings?.backupMaxCount?.value ?? 5,
        default: settings?.backupMaxCount?.default ?? 5,
      },
    },
    scoring: {
      penalizeMissingSalary: {
        effective: settings?.penalizeMissingSalary?.value ?? false,
        default: settings?.penalizeMissingSalary?.default ?? false,
      },
      missingSalaryPenalty: {
        effective: settings?.missingSalaryPenalty?.value ?? 10,
        default: settings?.missingSalaryPenalty?.default ?? 10,
      },
      autoSkipScoreThreshold: {
        effective: settings?.autoSkipScoreThreshold?.value ?? null,
        default: settings?.autoSkipScoreThreshold?.default ?? null,
      },
      blockedCompanyKeywords: {
        effective: settings?.blockedCompanyKeywords?.value ?? [],
        default: settings?.blockedCompanyKeywords?.default ?? [],
      },
    },
  };
};

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [rxresumeValidationStatuses, setRxresumeValidationStatuses] = useState<{
    v4: RxResumeValidationBadgeState;
    v5: RxResumeValidationBadgeState;
  }>({
    v4: EMPTY_RXRESUME_VALIDATION_BADGE_STATE,
    v5: EMPTY_RXRESUME_VALIDATION_BADGE_STATE,
  });
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
  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [isDeletingBackup, setIsDeletingBackup] = useState(false);
  const {
    readiness: tracerReadiness,
    isLoading: isTracerReadinessLoading,
    isChecking: isTracerReadinessChecking,
    refreshReadiness,
  } = useTracerReadiness();

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
    control,
    formState: { isDirty, errors, isValid, dirtyFields },
  } = methods;
  const {
    storedRxResume,
    getBaseResumeIdForMode,
    setBaseResumeIdForMode,
    syncBaseResumeIdsForMode,
  } = useRxResumeConfigState(settings);

  const settingsQuery = useQuery({
    queryKey: queryKeys.settings.current(),
    queryFn: api.getSettings,
  });
  const backupsQuery = useQuery({
    queryKey: queryKeys.backups.list(),
    queryFn: api.getBackups,
  });
  const updateSettingsMutation = useUpdateSettingsMutation();
  const isLoading = settingsQuery.isLoading;
  const backups = backupsQuery.data?.backups ?? [];
  const nextScheduled = backupsQuery.data?.nextScheduled ?? null;
  const isLoadingBackups = backupsQuery.isLoading;
  useQueryErrorToast(backupsQuery.error, "Failed to load backups");

  const rxresumeMode = (settings?.rxresumeMode?.value ?? "v5") as RxResumeMode;
  const selectedRxresumeMode = (useWatch({
    control,
    name: "rxresumeMode",
  }) ?? rxresumeMode) as RxResumeMode;
  const resumeProjectsValue = useWatch({
    control,
    name: "resumeProjects",
  });
  const hasRxResumeAccess = Boolean(
    rxresumeValidationStatuses[selectedRxresumeMode].valid,
  );

  useEffect(() => {
    if (!settingsQuery.data) return;
    setSettings(settingsQuery.data);
    reset(mapSettingsToForm(settingsQuery.data));
  }, [settingsQuery.data, reset]);

  useQueryErrorToast(settingsQuery.error, "Failed to load settings");

  useEffect(() => {
    if (!settings) return;
    const effectiveMode = coerceRxResumeMode(settings.rxresumeMode?.value);
    const storedId = syncBaseResumeIdsForMode(effectiveMode);
    setRxResumeBaseResumeIdDraft(storedId);
    setValue("rxresumeBaseResumeId", storedId, { shouldDirty: false });
    setRxResumeProjectsOverride(null);
  }, [settings, setValue, syncBaseResumeIdsForMode]);

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
      .getRxResumeProjects(
        rxResumeBaseResumeIdDraft,
        controller.signal,
        selectedRxresumeMode,
      )
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
  }, [
    rxResumeBaseResumeIdDraft,
    hasRxResumeAccess,
    selectedRxresumeMode,
    getValues,
    setValue,
  ]);

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

  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      await api.createManualBackup();
      toast.success("Backup created successfully");
      await queryClient.invalidateQueries({ queryKey: queryKeys.backups.all });
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.backups.all });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete backup";
      toast.error(message);
    } finally {
      setIsDeletingBackup(false);
    }
  };

  const handleVerifyTracerReadiness = useCallback(async () => {
    try {
      const readiness = await refreshReadiness(true);
      if (!readiness) {
        toast.error("Tracer links are unavailable. Verify your public URL.");
      } else if (readiness.canEnable) {
        toast.success("Tracer links are ready");
      } else {
        toast.error(
          readiness.reason ??
            "Tracer links are unavailable. Verify your public URL.",
        );
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to verify tracer-link readiness";
      toast.error(message);
    }
  }, [refreshReadiness]);

  const validateRxresumeMode = useCallback(
    async (
      mode: RxResumeMode,
      options?: { silent?: boolean; persistOnSuccess?: boolean },
    ) => {
      const { silent = false, persistOnSuccess = true } = options ?? {};
      const notify = !silent;
      const values = getValues();
      const draftCredentials = getRxResumeCredentialDrafts(values);
      const result = await validateAndMaybePersistRxResumeMode({
        mode,
        stored: storedRxResume,
        draft: draftCredentials,
        validate: api.validateRxresume,
        persist: api.updateSettings,
        persistOnSuccess,
        getPrecheckMessage: (failure) => RXRESUME_PRECHECK_MESSAGES[failure],
        getValidationErrorMessage: (error) =>
          error instanceof Error ? error.message : "RxResume validation failed",
        getPersistErrorMessage: (error) =>
          error instanceof Error ? error.message : "RxResume validation failed",
      });

      setRxresumeValidationStatuses((current) => ({
        ...current,
        [mode]: {
          checked: true,
          valid: result.validation.valid,
          message: result.validation.valid
            ? null
            : (result.validation.message ?? null),
        },
      }));

      if (result.updatedSettings) {
        setSettings(result.updatedSettings);
        queryClient.setQueryData(
          queryKeys.settings.current(),
          result.updatedSettings,
        );
        if (notify) {
          toast.success(`Reactive Resume ${mode} validation passed`);
        }
        return;
      }

      if (!notify || result.validation.valid) {
        return;
      }

      if (result.precheckFailure) {
        toast.info(
          result.validation.message ??
            RXRESUME_PRECHECK_MESSAGES[result.precheckFailure],
        );
        return;
      }

      toast.error(
        result.validation.message ||
          `Reactive Resume ${mode} validation failed`,
      );
    },
    [getValues, queryClient, storedRxResume],
  );

  useEffect(() => {
    if (!settings) return;

    const modesToCheck = RXRESUME_MODES.filter(
      (mode) => !rxresumeValidationStatuses[mode].checked,
    );
    if (modesToCheck.length === 0) return;

    void Promise.all(
      modesToCheck.map((mode) =>
        validateRxresumeMode(mode, { silent: true, persistOnSuccess: false }),
      ),
    );
  }, [settings, rxresumeValidationStatuses, validateRxresumeMode]);

  const effectiveProfileProjects =
    rxResumeProjectsOverride ??
    (selectedRxresumeMode === rxresumeMode ? profileProjects : []);
  const effectiveMaxProjectsTotal = effectiveProfileProjects.length;

  const lockedCount = resumeProjectsValue?.lockedProjectIds.length ?? 0;

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

      if (dirtyFields.adzunaAppId || dirtyFields.adzunaAppKey) {
        envPayload.adzunaAppId = normalizeString(data.adzunaAppId);
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

      if (dirtyFields.rxresumeApiKey) {
        const value = normalizePrivateInput(data.rxresumeApiKey);
        if (value !== undefined) envPayload.rxresumeApiKey = value;
      }

      if (dirtyFields.ukvisajobsPassword) {
        const value = normalizePrivateInput(data.ukvisajobsPassword);
        if (value !== undefined) envPayload.ukvisajobsPassword = value;
      }

      if (dirtyFields.adzunaAppKey) {
        const value = normalizePrivateInput(data.adzunaAppKey);
        if (value !== undefined) envPayload.adzunaAppKey = value;
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
        rxresumeMode: data.rxresumeMode ?? "v5",
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
        blockedCompanyKeywords: (() => {
          const normalized = normalizeStringArray(data.blockedCompanyKeywords);
          const normalizedDefault = normalizeStringArray(
            scoring.blockedCompanyKeywords.default,
          );
          return stringArraysEqual(normalized, normalizedDefault)
            ? null
            : normalized;
        })(),
        ...envPayload,
      };

      // Remove virtual field because the backend doesn't expect it
      // this exists only to toggle the UI
      // need to track it so that the save button is enabled when it changes
      delete payload.enableBasicAuth;

      const updated = await updateSettingsMutation.mutateAsync(payload);
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
      const updated = await updateSettingsMutation.mutateAsync(
        NULL_SETTINGS_PAYLOAD,
      );
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
            onRxresumeModeChange={(mode) => {
              const nextId = getBaseResumeIdForMode(mode);
              setRxResumeBaseResumeIdDraft(nextId);
              setValue("rxresumeBaseResumeId", nextId, { shouldDirty: true });
              setRxResumeProjectsOverride(null);
            }}
            setRxResumeBaseResumeIdDraft={(value) => {
              const mode = (getValues("rxresumeMode") ??
                rxresumeMode) as RxResumeMode;
              setBaseResumeIdForMode(mode, value);
              setRxResumeBaseResumeIdDraft(value);
              setValue("rxresumeBaseResumeId", value, { shouldDirty: true });
            }}
            hasRxResumeAccess={hasRxResumeAccess}
            rxresumeMode={rxresumeMode}
            validationStatuses={rxresumeValidationStatuses}
            profileProjects={effectiveProfileProjects}
            lockedCount={lockedCount}
            maxProjectsTotal={effectiveMaxProjectsTotal}
            isProjectsLoading={isFetchingRxResumeProjects}
            isLoading={isLoading}
            isSaving={isSaving}
          />
          <TracerLinksSettingsSection
            readiness={tracerReadiness}
            isLoading={isLoading || isTracerReadinessLoading}
            isChecking={isTracerReadinessChecking}
            onVerifyNow={handleVerifyTracerReadiness}
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
