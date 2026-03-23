import * as api from "@client/api";
import { PageHeader } from "@client/components/layout";
import { useUpdateSettingsMutation } from "@client/hooks/queries/useSettingsMutation";
import { useRxResumeConfigState } from "@client/hooks/useRxResumeConfigState";
import { useTracerReadiness } from "@client/hooks/useTracerReadiness";
import {
  coerceRxResumeMode,
  getRxResumeCredentialDrafts,
  getRxResumeCredentialPrecheckFailure,
  isRxResumeAvailabilityValidationFailure,
  isRxResumeBlockingValidationFailure,
  RXRESUME_MODES,
  RXRESUME_PRECHECK_MESSAGES,
  toRxResumeValidationPayload,
  validateAndMaybePersistRxResumeMode,
} from "@client/lib/rxresume-config";
import { BackupSettingsSection } from "@client/pages/settings/components/BackupSettingsSection";
import { ChatSettingsSection } from "@client/pages/settings/components/ChatSettingsSection";
import { DangerZoneSection } from "@client/pages/settings/components/DangerZoneSection";
import { DisplaySettingsSection } from "@client/pages/settings/components/DisplaySettingsSection";
import { EnvironmentSettingsSection } from "@client/pages/settings/components/EnvironmentSettingsSection";
import { ModelSettingsSection } from "@client/pages/settings/components/ModelSettingsSection";
import { PromptTemplatesSection } from "@client/pages/settings/components/PromptTemplatesSection";
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
  ValidationResult,
} from "@shared/types.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Settings } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FormProvider,
  type Resolver,
  useForm,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";
import { useQueryErrorToast } from "@/client/hooks/useQueryErrorToast";
import { queryKeys } from "@/client/lib/queryKeys";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  pdfRenderer: "rxresume",
  rxresumeMode: "v5",
  rxresumeBaseResumeId: null,
  showSponsorInfo: null,
  renderMarkdownInJobDescriptions: null,
  chatStyleTone: "",
  chatStyleFormality: "",
  chatStyleConstraints: "",
  chatStyleDoNotUse: "",
  chatStyleSummaryMaxWords: null,
  chatStyleMaxKeywordsPerSkill: null,
  chatStyleLanguageMode: null,
  chatStyleManualLanguage: null,
  rxresumeEmail: "",
  rxresumeUrl: "",
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
  scoringInstructions: "",
  ghostwriterSystemPromptTemplate: "",
  tailoringPromptTemplate: "",
  scoringPromptTemplate: "",
};

type LlmProviderValue = LlmProviderId | null;
type RxResumeValidationBadgeState = {
  checked: boolean;
  valid: boolean;
  message: string | null;
  status: number | null;
};
const EMPTY_RXRESUME_VALIDATION_BADGE_STATE: RxResumeValidationBadgeState = {
  checked: false,
  valid: false,
  message: null,
  status: null,
};

type SettingsSectionId =
  | "model"
  | "chat"
  | "prompt-templates"
  | "scoring"
  | "reactive-resume"
  | "webhooks"
  | "tracer-links"
  | "environment"
  | "display"
  | "backup"
  | "danger-zone";

type SettingsGroupId =
  | "ai"
  | "scoring"
  | "integrations"
  | "accounts"
  | "display"
  | "backups"
  | "danger";

type SettingsSectionDescriptor = {
  id: SettingsSectionId;
  label: string;
  description: string;
  searchTerms: string[];
};

type SettingsNavGroup = {
  id: SettingsGroupId;
  items: SettingsSectionDescriptor[];
  label: string;
};

const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    id: "ai",
    label: "AI",
    items: [
      {
        id: "model",
        label: "Models",
        description: "Provider, API credentials, and task-specific overrides.",
        searchTerms: ["llm", "provider", "openai", "gemini", "ollama"],
      },
      {
        id: "chat",
        label: "Writing Style",
        description: "Tone, language, presets, and writing constraints.",
        searchTerms: ["ghostwriter", "language", "tone", "formality"],
      },
      {
        id: "prompt-templates",
        label: "Prompt Templates",
        description:
          "Base AI instructions for Ghostwriter, tailoring, and scoring.",
        searchTerms: ["prompt", "templates", "system prompt", "instructions"],
      },
    ],
  },
  {
    id: "scoring",
    label: "Scoring",
    items: [
      {
        id: "scoring",
        label: "Rules & Filters",
        description:
          "Salary penalties, thresholds, keywords, and scorer hints.",
        searchTerms: ["threshold", "salary", "keywords", "instructions"],
      },
    ],
  },
  {
    id: "integrations",
    label: "Integrations",
    items: [
      {
        id: "reactive-resume",
        label: "Reactive Resume",
        description: "Resume sync, templates, and project selection.",
        searchTerms: ["rxresume", "resume", "projects", "template"],
      },
      {
        id: "webhooks",
        label: "Webhooks",
        description: "Pipeline and job completion event destinations.",
        searchTerms: ["hooks", "notifications", "pipeline", "applied"],
      },
      {
        id: "tracer-links",
        label: "Tracer Links",
        description: "Public URL readiness and verification state.",
        searchTerms: ["public url", "verify", "readiness", "health"],
      },
    ],
  },
  {
    id: "accounts",
    label: "Accounts & Security",
    items: [
      {
        id: "environment",
        label: "Accounts & Access",
        description: "Service credentials and basic auth protection.",
        searchTerms: ["security", "auth", "adzuna", "ukvisajobs"],
      },
    ],
  },
  {
    id: "display",
    label: "Display",
    items: [
      {
        id: "display",
        label: "Display Preferences",
        description: "Sponsor badges and markdown rendering behavior.",
        searchTerms: ["markdown", "sponsor", "rendering", "appearance"],
      },
    ],
  },
  {
    id: "backups",
    label: "Backups",
    items: [
      {
        id: "backup",
        label: "Backups",
        description: "Automatic schedules, retention, and manual snapshots.",
        searchTerms: ["recovery", "database", "restore", "schedule"],
      },
    ],
  },
  {
    id: "danger",
    label: "Danger Zone",
    items: [
      {
        id: "danger-zone",
        label: "Danger Zone",
        description: "Delete jobs, runs, or the full local database.",
        searchTerms: ["delete", "clear", "cleanup", "destructive"],
      },
    ],
  },
];

const SECTION_FIELD_MAP: Record<
  SettingsSectionId,
  Array<keyof UpdateSettingsInput>
> = {
  model: [
    "llmProvider",
    "llmBaseUrl",
    "llmApiKey",
    "model",
    "modelScorer",
    "modelTailoring",
    "modelProjectSelection",
  ],
  chat: [
    "chatStyleTone",
    "chatStyleFormality",
    "chatStyleConstraints",
    "chatStyleDoNotUse",
    "chatStyleLanguageMode",
    "chatStyleManualLanguage",
  ],
  "prompt-templates": [
    "ghostwriterSystemPromptTemplate",
    "tailoringPromptTemplate",
    "scoringPromptTemplate",
  ],
  scoring: [
    "penalizeMissingSalary",
    "missingSalaryPenalty",
    "autoSkipScoreThreshold",
    "blockedCompanyKeywords",
    "scoringInstructions",
  ],
  "reactive-resume": [
    "pdfRenderer",
    "rxresumeMode",
    "rxresumeBaseResumeId",
    "rxresumeApiKey",
    "rxresumeEmail",
    "rxresumePassword",
    "rxresumeUrl",
    "resumeProjects",
  ],
  webhooks: ["pipelineWebhookUrl", "jobCompleteWebhookUrl", "webhookSecret"],
  "tracer-links": [],
  environment: [
    "ukvisajobsEmail",
    "ukvisajobsPassword",
    "adzunaAppId",
    "adzunaAppKey",
    "enableBasicAuth",
    "basicAuthUser",
    "basicAuthPassword",
  ],
  display: ["showSponsorInfo", "renderMarkdownInJobDescriptions"],
  backup: ["backupEnabled", "backupHour", "backupMaxCount"],
  "danger-zone": [],
};

function matchesSettingsSearch(
  searchTerm: string,
  item: SettingsSectionDescriptor,
): boolean {
  if (!searchTerm) return true;
  const normalized = searchTerm.toLowerCase();
  const haystack = [item.label, item.description, ...item.searchTerms].join(
    " ",
  );
  return haystack.toLowerCase().includes(normalized);
}

const getRxResumeValidationFieldsForMode = (
  mode: RxResumeMode,
): Array<keyof UpdateSettingsInput> =>
  mode === "v5"
    ? ["rxresumeApiKey", "rxresumeUrl"]
    : ["rxresumeEmail", "rxresumePassword", "rxresumeUrl"];

const toRxResumeValidationBadgeState = (
  validation: ValidationResult,
): RxResumeValidationBadgeState => ({
  checked: true,
  valid: validation.valid,
  message: validation.valid ? null : (validation.message ?? null),
  status: validation.valid ? null : (validation.status ?? null),
});

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
  pdfRenderer: null,
  rxresumeMode: null,
  rxresumeBaseResumeId: null,
  showSponsorInfo: null,
  renderMarkdownInJobDescriptions: null,
  chatStyleTone: null,
  chatStyleFormality: null,
  chatStyleConstraints: null,
  chatStyleDoNotUse: null,
  chatStyleSummaryMaxWords: null,
  chatStyleMaxKeywordsPerSkill: null,
  chatStyleLanguageMode: null,
  chatStyleManualLanguage: null,
  rxresumeEmail: null,
  rxresumeUrl: null,
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
  scoringInstructions: null,
  ghostwriterSystemPromptTemplate: null,
  tailoringPromptTemplate: null,
  scoringPromptTemplate: null,
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
  pdfRenderer: data.pdfRenderer.override ?? data.pdfRenderer.value,
  rxresumeMode: data.rxresumeMode.override ?? data.rxresumeMode.value,
  rxresumeBaseResumeId: data.rxresumeBaseResumeId,
  showSponsorInfo: data.showSponsorInfo.override,
  renderMarkdownInJobDescriptions:
    data.renderMarkdownInJobDescriptions.override,
  chatStyleTone: data.chatStyleTone.override ?? "",
  chatStyleFormality: data.chatStyleFormality.override ?? "",
  chatStyleConstraints: data.chatStyleConstraints.override ?? "",
  chatStyleDoNotUse: data.chatStyleDoNotUse.override ?? "",
  chatStyleSummaryMaxWords: data.chatStyleSummaryMaxWords.override ?? null,
  chatStyleMaxKeywordsPerSkill:
    data.chatStyleMaxKeywordsPerSkill.override ?? null,
  chatStyleLanguageMode: data.chatStyleLanguageMode.override ?? null,
  chatStyleManualLanguage: data.chatStyleManualLanguage.override ?? null,
  rxresumeEmail: data.rxresumeEmail ?? "",
  rxresumeUrl: data.rxresumeUrl ?? "",
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
  scoringInstructions: data.scoringInstructions.override ?? "",
  ghostwriterSystemPromptTemplate:
    data.ghostwriterSystemPromptTemplate.value ?? "",
  tailoringPromptTemplate: data.tailoringPromptTemplate.value ?? "",
  scoringPromptTemplate: data.scoringPromptTemplate.value ?? "",
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
    reactiveResume: {
      pdfRenderer: {
        effective: settings?.pdfRenderer?.value ?? "rxresume",
        default: settings?.pdfRenderer?.default ?? "rxresume",
      },
    },
    display: {
      showSponsorInfo: {
        effective: settings?.showSponsorInfo?.value ?? true,
        default: settings?.showSponsorInfo?.default ?? true,
      },
      renderMarkdownInJobDescriptions: {
        effective: settings?.renderMarkdownInJobDescriptions?.value ?? true,
        default: settings?.renderMarkdownInJobDescriptions?.default ?? true,
      },
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
      languageMode: {
        effective: settings?.chatStyleLanguageMode?.value ?? "manual",
        default: settings?.chatStyleLanguageMode?.default ?? "manual",
      },
      manualLanguage: {
        effective: settings?.chatStyleManualLanguage?.value ?? "english",
        default: settings?.chatStyleManualLanguage?.default ?? "english",
      },
      summaryMaxWords: {
        effective: settings?.chatStyleSummaryMaxWords?.value ?? null,
        default: settings?.chatStyleSummaryMaxWords?.default ?? null,
      },
      maxKeywordsPerSkill: {
        effective: settings?.chatStyleMaxKeywordsPerSkill?.value ?? null,
        default: settings?.chatStyleMaxKeywordsPerSkill?.default ?? null,
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
      scoringInstructions: {
        effective: settings?.scoringInstructions?.value ?? "",
        default: settings?.scoringInstructions?.default ?? "",
      },
    },
    promptTemplates: {
      ghostwriterSystemPromptTemplate: {
        effective: settings?.ghostwriterSystemPromptTemplate?.value ?? "",
        default: settings?.ghostwriterSystemPromptTemplate?.default ?? "",
      },
      tailoringPromptTemplate: {
        effective: settings?.tailoringPromptTemplate?.value ?? "",
        default: settings?.tailoringPromptTemplate?.default ?? "",
      },
      scoringPromptTemplate: {
        effective: settings?.scoringPromptTemplate?.value ?? "",
        default: settings?.scoringPromptTemplate?.default ?? "",
      },
    },
  };
};

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>("model");
  const [openGroups, setOpenGroups] = useState<SettingsGroupId[]>([]);
  const [settingsSearch, setSettingsSearch] = useState("");
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
    clearErrors,
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
    reactiveResume,
    display,
    chat,
    envSettings,
    defaultResumeProjects,
    profileProjects,
    backup,
    scoring,
    promptTemplates,
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

  const setRxResumeValidationStatus = useCallback(
    (mode: RxResumeMode, validation: ValidationResult) => {
      setRxresumeValidationStatuses((current) => ({
        ...current,
        [mode]: toRxResumeValidationBadgeState(validation),
      }));
    },
    [],
  );

  const clearRxResumeValidationFeedback = useCallback(
    (mode: RxResumeMode) => {
      setRxresumeValidationStatuses((current) => ({
        ...current,
        [mode]: EMPTY_RXRESUME_VALIDATION_BADGE_STATE,
      }));
      clearErrors(getRxResumeValidationFieldsForMode(mode));
    },
    [clearErrors],
  );

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
        skipPrecheck: silent,
        getPrecheckMessage: (failure) => RXRESUME_PRECHECK_MESSAGES[failure],
        getValidationErrorMessage: (error) =>
          error instanceof Error ? error.message : "RxResume validation failed",
        getPersistErrorMessage: (error) =>
          error instanceof Error ? error.message : "RxResume validation failed",
      });

      setRxResumeValidationStatus(mode, result.validation);

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
    [getValues, queryClient, setRxResumeValidationStatus, storedRxResume],
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
  }, [rxresumeValidationStatuses, settings, validateRxresumeMode]);

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

      if (dirtyFields.rxresumeUrl) {
        envPayload.rxresumeUrl = normalizeString(data.rxresumeUrl);
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

      const payload: Partial<UpdateSettingsInput> = {
        model: dirtyFields.llmProvider
          ? dirtyFields.model
            ? normalizeString(data.model)
            : null
          : normalizeString(data.model),
        modelScorer: dirtyFields.llmProvider
          ? dirtyFields.modelScorer
            ? normalizeString(data.modelScorer)
            : null
          : normalizeString(data.modelScorer),
        modelTailoring: dirtyFields.llmProvider
          ? dirtyFields.modelTailoring
            ? normalizeString(data.modelTailoring)
            : null
          : normalizeString(data.modelTailoring),
        modelProjectSelection: dirtyFields.llmProvider
          ? dirtyFields.modelProjectSelection
            ? normalizeString(data.modelProjectSelection)
            : null
          : normalizeString(data.modelProjectSelection),
        pipelineWebhookUrl: normalizeString(data.pipelineWebhookUrl),
        jobCompleteWebhookUrl: normalizeString(data.jobCompleteWebhookUrl),
        resumeProjects: resumeProjectsOverride,
        pdfRenderer: nullIfSame(
          data.pdfRenderer,
          reactiveResume.pdfRenderer.default,
        ),
        ...(dirtyFields.rxresumeMode
          ? { rxresumeMode: data.rxresumeMode ?? "v5" }
          : {}),
        ...(dirtyFields.rxresumeBaseResumeId
          ? { rxresumeBaseResumeId: normalizeString(data.rxresumeBaseResumeId) }
          : {}),
        showSponsorInfo: nullIfSame(
          data.showSponsorInfo,
          display.showSponsorInfo.default,
        ),
        renderMarkdownInJobDescriptions: nullIfSame(
          data.renderMarkdownInJobDescriptions,
          display.renderMarkdownInJobDescriptions.default,
        ),
        chatStyleTone: normalizeString(data.chatStyleTone),
        chatStyleFormality: normalizeString(data.chatStyleFormality),
        chatStyleConstraints: normalizeString(data.chatStyleConstraints),
        chatStyleDoNotUse: normalizeString(data.chatStyleDoNotUse),
        chatStyleSummaryMaxWords: Number.isNaN(data.chatStyleSummaryMaxWords)
          ? null
          : (data.chatStyleSummaryMaxWords ?? null),
        chatStyleMaxKeywordsPerSkill: Number.isNaN(
          data.chatStyleMaxKeywordsPerSkill,
        )
          ? null
          : (data.chatStyleMaxKeywordsPerSkill ?? null),
        chatStyleLanguageMode: data.chatStyleLanguageMode ?? null,
        chatStyleManualLanguage: data.chatStyleManualLanguage ?? null,
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
        scoringInstructions: nullIfSame(
          normalizeString(data.scoringInstructions),
          scoring.scoringInstructions.default,
        ),
        ghostwriterSystemPromptTemplate: nullIfSame(
          normalizeString(data.ghostwriterSystemPromptTemplate),
          promptTemplates.ghostwriterSystemPromptTemplate.default,
        ),
        tailoringPromptTemplate: nullIfSame(
          normalizeString(data.tailoringPromptTemplate),
          promptTemplates.tailoringPromptTemplate.default,
        ),
        scoringPromptTemplate: nullIfSame(
          normalizeString(data.scoringPromptTemplate),
          promptTemplates.scoringPromptTemplate.default,
        ),
        ...envPayload,
      };

      const shouldValidateRxResumeBeforeSave = Boolean(
        dirtyFields.rxresumeMode ||
          dirtyFields.rxresumeUrl ||
          dirtyFields.rxresumeApiKey ||
          dirtyFields.rxresumeEmail ||
          dirtyFields.rxresumePassword,
      );
      const rxResumeValidationMode = (data.rxresumeMode ??
        rxresumeMode) as RxResumeMode;
      let rxResumeSaveWarningMessage: string | null = null;

      if (shouldValidateRxResumeBeforeSave) {
        const validationDraft = getRxResumeCredentialDrafts(data);
        const precheckFailure = getRxResumeCredentialPrecheckFailure({
          mode: rxResumeValidationMode,
          stored: storedRxResume,
          draft: validationDraft,
        });

        if (!precheckFailure) {
          const preserveBlankFields = [
            ...(dirtyFields.rxresumeEmail ? (["email"] as const) : []),
            ...(dirtyFields.rxresumePassword ? (["password"] as const) : []),
            ...(dirtyFields.rxresumeApiKey ? (["apiKey"] as const) : []),
            ...(dirtyFields.rxresumeUrl ? (["baseUrl"] as const) : []),
          ];
          const validation = await api.validateRxresume({
            mode: rxResumeValidationMode,
            ...toRxResumeValidationPayload(validationDraft, {
              preserveBlankFields: preserveBlankFields as Array<
                keyof ReturnType<typeof getRxResumeCredentialDrafts>
              >,
            }),
          });

          setRxResumeValidationStatus(rxResumeValidationMode, validation);

          if (isRxResumeBlockingValidationFailure(validation)) {
            clearErrors(
              getRxResumeValidationFieldsForMode(rxResumeValidationMode),
            );
            if (rxResumeValidationMode === "v5") {
              setError("rxresumeApiKey", {
                type: "manual",
                message:
                  validation.message ??
                  "Reactive Resume v5 API key is invalid.",
              });
            } else {
              setError("rxresumeEmail", {
                type: "manual",
                message:
                  validation.message ??
                  "Reactive Resume v4 email/password is invalid.",
              });
              setError("rxresumePassword", {
                type: "manual",
                message:
                  validation.message ??
                  "Reactive Resume v4 email/password is invalid.",
              });
            }
            return;
          }

          clearErrors(
            getRxResumeValidationFieldsForMode(rxResumeValidationMode),
          );
          if (isRxResumeAvailabilityValidationFailure(validation)) {
            rxResumeSaveWarningMessage =
              "Settings saved, but JobOps could not verify Reactive Resume because the instance is unavailable.";
          }
        }
      }

      const updated = await updateSettingsMutation.mutateAsync(payload);
      setSettings(updated);
      reset(mapSettingsToForm(updated));
      toast.success("Settings saved");
      if (rxResumeSaveWarningMessage) {
        toast.info(rxResumeSaveWarningMessage);
      }
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

  const handleDiscardChanges = () => {
    if (!settings) return;
    reset(mapSettingsToForm(settings));
    toast.success("Discarded unsaved changes");
  };

  const filteredNavGroups = useMemo(
    () =>
      SETTINGS_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          matchesSettingsSearch(settingsSearch, item),
        ),
      })).filter((group) => group.items.length > 0),
    [settingsSearch],
  );

  const visibleSectionIds = useMemo(
    () =>
      filteredNavGroups.flatMap((group) => group.items.map((item) => item.id)),
    [filteredNavGroups],
  );

  useEffect(() => {
    if (visibleSectionIds.length === 0) return;
    if (!visibleSectionIds.includes(activeSection)) {
      setActiveSection(visibleSectionIds[0]);
    }
  }, [activeSection, visibleSectionIds]);

  const activeSectionMeta =
    SETTINGS_NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.id === activeSection,
    ) ?? SETTINGS_NAV_GROUPS[0].items[0];
  const activeGroup =
    SETTINGS_NAV_GROUPS.find((group) =>
      group.items.some((item) => item.id === activeSection),
    ) ?? SETTINGS_NAV_GROUPS[0];

  const sectionHasDirtyState = (sectionId: SettingsSectionId) =>
    SECTION_FIELD_MAP[sectionId].some((field) => Boolean(dirtyFields[field]));
  const sectionHasErrors = (sectionId: SettingsSectionId) =>
    SECTION_FIELD_MAP[sectionId].some((field) => Boolean(errors[field]));

  const getSectionBadge = (sectionId: SettingsSectionId) => {
    if (sectionId === "danger-zone") {
      return { label: "Sensitive", variant: "destructive" as const };
    }
    if (sectionHasErrors(sectionId)) {
      return { label: "Needs attention", variant: "destructive" as const };
    }
    if (sectionHasDirtyState(sectionId)) {
      return { label: "Unsaved", variant: "secondary" as const };
    }

    switch (sectionId) {
      case "model":
        return model.llmProvider
          ? { label: "Configured", variant: "outline" as const }
          : { label: "Using defaults", variant: "secondary" as const };
      case "chat":
        return chat.tone.effective || chat.constraints.effective
          ? { label: "Ready", variant: "outline" as const }
          : { label: "Using defaults", variant: "secondary" as const };
      case "prompt-templates":
        return promptTemplates.ghostwriterSystemPromptTemplate.effective !==
          promptTemplates.ghostwriterSystemPromptTemplate.default ||
          promptTemplates.tailoringPromptTemplate.effective !==
            promptTemplates.tailoringPromptTemplate.default ||
          promptTemplates.scoringPromptTemplate.effective !==
            promptTemplates.scoringPromptTemplate.default
          ? { label: "Customized", variant: "outline" as const }
          : { label: "Using defaults", variant: "secondary" as const };
      case "scoring":
        return scoring.autoSkipScoreThreshold.effective != null ||
          scoring.blockedCompanyKeywords.effective.length > 0 ||
          scoring.scoringInstructions.effective
          ? { label: "Customized", variant: "outline" as const }
          : { label: "Default rules", variant: "secondary" as const };
      case "reactive-resume":
        return hasRxResumeAccess
          ? { label: "Connected", variant: "outline" as const }
          : null;
      case "webhooks":
        return pipelineWebhook.effective || jobCompleteWebhook.effective
          ? { label: "Configured", variant: "outline" as const }
          : { label: "Optional", variant: "secondary" as const };
      case "tracer-links":
        return tracerReadiness?.status === "ready"
          ? { label: "Ready", variant: "outline" as const }
          : tracerReadiness
            ? { label: "Check required", variant: "secondary" as const }
            : { label: "Not configured", variant: "secondary" as const };
      case "environment":
        return envSettings.readable.ukvisajobsEmail ||
          envSettings.readable.adzunaAppId ||
          envSettings.basicAuthActive
          ? { label: "Configured", variant: "outline" as const }
          : null;
      case "display":
        return { label: "Active", variant: "secondary" as const };
      case "backup":
        return backup.backupEnabled.effective
          ? { label: "Scheduled", variant: "outline" as const }
          : { label: "Manual only", variant: "secondary" as const };
      default:
        return { label: "Ready", variant: "outline" as const };
    }
  };

  const selectedSectionBadge = getSectionBadge(activeSection);
  const dirtySectionCount = SETTINGS_NAV_GROUPS.flatMap(
    (group) => group.items,
  ).filter((item) => sectionHasDirtyState(item.id)).length;
  const activeSectionIsDirty = sectionHasDirtyState(activeSection);

  let activeSectionContent: React.ReactNode;
  switch (activeSection) {
    case "model":
      activeSectionContent = (
        <ModelSettingsSection
          values={model}
          isLoading={isLoading}
          isSaving={isSaving}
          layoutMode="panel"
        />
      );
      break;
    case "chat":
      activeSectionContent = (
        <ChatSettingsSection
          values={chat}
          isLoading={isLoading}
          isSaving={isSaving}
          layoutMode="panel"
        />
      );
      break;
    case "prompt-templates":
      activeSectionContent = (
        <PromptTemplatesSection
          values={promptTemplates}
          isLoading={isLoading}
          isSaving={isSaving}
          layoutMode="panel"
        />
      );
      break;
    case "scoring":
      activeSectionContent = (
        <ScoringSettingsSection
          values={scoring}
          isLoading={isLoading}
          isSaving={isSaving}
          layoutMode="panel"
        />
      );
      break;
    case "reactive-resume":
      activeSectionContent = (
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
          onCredentialFieldEdit={clearRxResumeValidationFeedback}
          validationStatuses={rxresumeValidationStatuses}
          profileProjects={effectiveProfileProjects}
          lockedCount={lockedCount}
          maxProjectsTotal={effectiveMaxProjectsTotal}
          isProjectsLoading={isFetchingRxResumeProjects}
          isLoading={isLoading}
          isSaving={isSaving}
          layoutMode="panel"
        />
      );
      break;
    case "webhooks":
      activeSectionContent = (
        <WebhooksSection
          pipelineWebhook={pipelineWebhook}
          jobCompleteWebhook={jobCompleteWebhook}
          webhookSecretHint={envSettings.private.webhookSecretHint}
          isLoading={isLoading}
          isSaving={isSaving}
          layoutMode="panel"
        />
      );
      break;
    case "tracer-links":
      activeSectionContent = (
        <TracerLinksSettingsSection
          readiness={tracerReadiness}
          isLoading={isLoading || isTracerReadinessLoading}
          isChecking={isTracerReadinessChecking}
          onVerifyNow={handleVerifyTracerReadiness}
          layoutMode="panel"
        />
      );
      break;
    case "environment":
      activeSectionContent = (
        <EnvironmentSettingsSection
          values={envSettings}
          isLoading={isLoading}
          isSaving={isSaving}
          layoutMode="panel"
        />
      );
      break;
    case "display":
      activeSectionContent = (
        <DisplaySettingsSection
          values={display}
          isLoading={isLoading}
          isSaving={isSaving}
          layoutMode="panel"
        />
      );
      break;
    case "backup":
      activeSectionContent = (
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
          layoutMode="panel"
        />
      );
      break;
    case "danger-zone":
      activeSectionContent = (
        <DangerZoneSection
          statusesToClear={statusesToClear}
          toggleStatusToClear={toggleStatusToClear}
          handleClearByStatuses={handleClearByStatuses}
          handleClearDatabase={handleClearDatabase}
          handleClearByScore={handleClearByScore}
          isLoading={isLoading}
          isSaving={isSaving}
          layoutMode="panel"
        />
      );
      break;
    default:
      activeSectionContent = null;
  }

  return (
    <FormProvider {...methods}>
      <PageHeader
        icon={Settings}
        title="Settings"
        subtitle="Configure AI, scoring, integrations, and recovery from one focused workspace."
      />

      <main className="container mx-auto max-w-7xl px-4 py-6 pb-12">
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/95">
              <div className="border-b px-4 py-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={settingsSearch}
                    onChange={(event) => setSettingsSearch(event.target.value)}
                    placeholder="Search settings"
                    className="pl-9"
                    aria-label="Search settings"
                  />
                </div>
              </div>
              <div className="p-2">
                {filteredNavGroups.length > 0 ? (
                  <Accordion
                    type="multiple"
                    value={
                      settingsSearch.trim()
                        ? filteredNavGroups.map((group) => group.id)
                        : openGroups
                    }
                    onValueChange={(value) =>
                      setOpenGroups(value as SettingsGroupId[])
                    }
                    className="space-y-1"
                  >
                    {filteredNavGroups.map((group) => (
                      <AccordionItem
                        key={group.id}
                        value={group.id}
                        className="border-b border-border/60 px-2 last:border-b-0"
                      >
                        <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground hover:no-underline">
                          {group.label}
                        </AccordionTrigger>
                        <AccordionContent className="pb-3">
                          <div className="space-y-1">
                            {group.items.map((item) => {
                              const isActive = item.id === activeSection;
                              return (
                                <Button
                                  key={item.id}
                                  type="button"
                                  variant="ghost"
                                  className={`h-9 w-full justify-start rounded-md px-3 text-left text-sm font-medium ${
                                    isActive
                                      ? "border border-orange-400/40 bg-orange-500/12 text-orange-100 hover:bg-orange-500/18 hover:text-orange-50"
                                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                                  }`}
                                  onClick={() => setActiveSection(item.id)}
                                >
                                  {item.label}
                                </Button>
                              );
                            })}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                ) : (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    No settings matched “{settingsSearch.trim()}”.
                  </div>
                )}
              </div>
            </div>
          </aside>

          <section className="space-y-4">
            <header className="space-y-4 border-b border-border/70 pb-5">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
                <span>{activeGroup.label}</span>
                <span>/</span>
                <span>{activeSectionMeta.label}</span>
              </div>

              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {activeSectionMeta.label}
                    </h2>
                    {selectedSectionBadge ? (
                      <Badge variant={selectedSectionBadge.variant}>
                        {selectedSectionBadge.label}
                      </Badge>
                    ) : null}
                    {dirtySectionCount > 0 ? (
                      <Badge variant="secondary">
                        {dirtySectionCount} unsaved section
                        {dirtySectionCount !== 1 ? "s" : ""}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    {activeSectionMeta.description}
                  </p>
                </div>

                <div className="flex shrink-0 flex-nowrap gap-2 self-start">
                  {activeSectionIsDirty ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="whitespace-nowrap"
                      onClick={handleDiscardChanges}
                      disabled={isLoading || isSaving || !isDirty}
                    >
                      Discard changes
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="whitespace-nowrap"
                    onClick={handleReset}
                    disabled={isLoading || isSaving || !settings}
                  >
                    Reset to defaults
                  </Button>
                  <Button
                    type="button"
                    className="whitespace-nowrap"
                    onClick={handleSubmit(onSave)}
                    disabled={isLoading || isSaving || !canSave}
                  >
                    {isSaving ? "Saving..." : "Save changes"}
                  </Button>
                </div>
              </div>
            </header>

            {activeSectionContent}

            {Object.keys(errors).length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/[0.03] px-4 py-3 text-sm text-destructive">
                Please fix the highlighted errors before saving.
              </div>
            )}
          </section>
        </div>
      </main>
    </FormProvider>
  );
};
