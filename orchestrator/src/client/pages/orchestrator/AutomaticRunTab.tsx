import * as api from "@client/api";
import {
  createLocationIntent,
  planLocationSources,
} from "@shared/location-intelligence.js";
import type {
  LocationMatchStrictness,
  LocationSearchScope,
} from "@shared/location-preferences.js";
import {
  formatCountryLabel,
  normalizeCountryKey,
  SUPPORTED_COUNTRY_KEYS,
} from "@shared/location-support.js";
import {
  type AppSettings,
  type CreatePipelineSearchPresetInput,
  type JobSource,
  MAX_PIPELINE_RUN_BUDGET,
  MIN_PIPELINE_RUN_BUDGET,
  normalizePipelineRunBudget,
  type PipelineSearchPreset,
  type PipelineSearchPresetConfig,
  type UpdatePipelineSearchPresetInput,
  type WatchlistSelectedSource,
} from "@shared/types";
import { ArrowLeft, Info } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { showErrorToast } from "@/client/lib/error-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDetectedCountryKey } from "@/lib/user-location";
import { cn } from "@/lib/utils";
import { AutomaticRankingPreferencesCard } from "./AutomaticRankingPreferencesCard";
import { AutomaticRunFooter } from "./AutomaticRunFooter";
import { AutomaticRunSettingsCard } from "./AutomaticRunSettingsCard";
import { AutomaticSavedSearchControls } from "./AutomaticSavedSearchControls";
import { AutomaticSaveSearchDialog } from "./AutomaticSaveSearchDialog";
import { AutomaticSearchPrompt } from "./AutomaticSearchPrompt";
import { AutomaticSearchTermsCard } from "./AutomaticSearchTermsCard";
import {
  AutomaticSourcePickerCard,
  type AutomaticSourcePickerRow,
} from "./AutomaticSourcePickerCard";
import {
  AUTOMATIC_PRESETS,
  type AutomaticPresetId,
  type AutomaticPresetSelection,
  type AutomaticRunValues,
  calculateAutomaticEstimate,
  loadAutomaticRunMemory,
  normalizeWorkplaceTypes,
  parseCityLocationsSetting,
  saveAutomaticRunMemory,
  summarizeLocationPreferences,
  type WorkplaceType,
} from "./automatic-run";
import { getSourceStatus } from "./automatic-run-source-status";

interface AutomaticRunTabProps {
  open: boolean;
  settings: AppSettings | null;
  enabledSources: JobSource[];
  pipelineSources: JobSource[];
  onToggleSource: (source: JobSource, checked: boolean) => void;
  onSetPipelineSources: (sources: JobSource[]) => void;
  watchlistSources?: WatchlistSelectedSource[];
  selectedWatchlistSourceIds?: string[];
  onToggleWatchlistSource?: (sourceId: string, checked: boolean) => void;
  onSetSelectedWatchlistSourceIds?: (ids: string[]) => void;
  isWatchlistSourcesLoading?: boolean;
  isPipelineRunning: boolean;
  onSaveAndRun: (values: AutomaticRunValues) => Promise<void>;
  savedSearches?: PipelineSearchPreset[];
  isSavedSearchesLoading?: boolean;
  onCreateSavedSearch?: (
    input: CreatePipelineSearchPresetInput,
  ) => Promise<PipelineSearchPreset>;
  onUpdateSavedSearch?: (
    id: string,
    input: UpdatePipelineSearchPresetInput,
  ) => Promise<PipelineSearchPreset>;
  onDeleteSavedSearch?: (id: string) => Promise<void>;
  onApplySavedSearch?: (preset: PipelineSearchPreset) => Promise<void>;
}

const DEFAULT_VALUES: AutomaticRunValues = {
  topN: 10,
  minSuitabilityScore: 50,
  searchTerms: ["web developer"],
  scoringInstructions: "",
  runBudget: MIN_PIPELINE_RUN_BUDGET,
  country: "",
  cityLocations: [],
  locationMode: "radius",
  proximity: null,
  workplaceTypes: ["remote", "hybrid", "onsite"],
  searchScope: "selected_only",
  matchStrictness: "exact_only",
};

interface AutomaticRunFormValues {
  topN: string;
  minSuitabilityScore: string;
  runBudget: string;
  country: string;
  cityLocations: string[];
  cityLocationDraft: string;
  locationMode: AutomaticRunValues["locationMode"];
  proximity: AutomaticRunValues["proximity"];
  workplaceTypes: WorkplaceType[];
  searchScope: LocationSearchScope;
  matchStrictness: LocationMatchStrictness;
  searchTerms: string[];
  searchTermDraft: string;
  scoringInstructions: string;
}

const HIDDEN_COUNTRY_KEYS = new Set(["usa/ca"]);
function normalizeUiCountryKey(value: string): string {
  const normalized = normalizeCountryKey(value);
  if (normalized === "usa/ca") return "united states";
  return normalized;
}

function toNumber(input: string, min: number, max: number, fallback: number) {
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeRunBudget(value: number): number {
  return normalizePipelineRunBudget(value);
}

export const AutomaticRunTab: React.FC<AutomaticRunTabProps> = ({
  open,
  settings,
  enabledSources,
  pipelineSources,
  onToggleSource,
  onSetPipelineSources,
  watchlistSources = [],
  selectedWatchlistSourceIds = [],
  onToggleWatchlistSource,
  onSetSelectedWatchlistSourceIds,
  isWatchlistSourcesLoading = false,
  isPipelineRunning,
  onSaveAndRun,
  savedSearches = [],
  isSavedSearchesLoading = false,
  onCreateSavedSearch,
  onUpdateSavedSearch,
  onDeleteSavedSearch,
  onApplySavedSearch,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isPlanningSearch, setIsPlanningSearch] = useState(false);
  const [searchPrompt, setSearchPrompt] = useState("");
  const [automaticTab, setAutomaticTab] = useState<"describe" | "details">(
    "describe",
  );
  const [planSummary, setPlanSummary] = useState<string | null>(null);
  const [planWarnings, setPlanWarnings] = useState<string[]>([]);
  const [planSource, setPlanSource] = useState<"ai" | "fallback" | null>(null);
  const wasOpenRef = useRef(open);
  const [isSavingSearch, setIsSavingSearch] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogMode, setSaveDialogMode] = useState<"create" | "update">(
    "create",
  );
  const [saveName, setSaveName] = useState("");
  const [selectedSavedSearchId, setSelectedSavedSearchId] = useState<
    string | null
  >(null);
  const [sourceDisplayOrder, setSourceDisplayOrder] =
    useState<JobSource[]>(enabledSources);
  const [browserCountrySuggestion, setBrowserCountrySuggestion] = useState<
    string | null
  >(null);
  const [selectedPreset, setSelectedPreset] =
    useState<AutomaticPresetSelection>("custom");
  const { watch, reset, setValue } = useForm<AutomaticRunFormValues>({
    defaultValues: {
      topN: String(DEFAULT_VALUES.topN),
      minSuitabilityScore: String(DEFAULT_VALUES.minSuitabilityScore),
      runBudget: String(DEFAULT_VALUES.runBudget),
      country: DEFAULT_VALUES.country,
      cityLocations: [],
      cityLocationDraft: "",
      locationMode: DEFAULT_VALUES.locationMode,
      proximity: DEFAULT_VALUES.proximity,
      workplaceTypes: DEFAULT_VALUES.workplaceTypes,
      searchScope: DEFAULT_VALUES.searchScope,
      matchStrictness: DEFAULT_VALUES.matchStrictness,
      searchTerms: DEFAULT_VALUES.searchTerms,
      searchTermDraft: "",
      scoringInstructions: DEFAULT_VALUES.scoringInstructions,
    },
  });

  const topNInput = watch("topN");
  const minScoreInput = watch("minSuitabilityScore");
  const runBudgetInput = watch("runBudget");
  const countryInput = watch("country");
  const cityLocations = watch("cityLocations");
  const cityLocationDraft = watch("cityLocationDraft");
  const locationMode = watch("locationMode");
  const proximity = watch("proximity");
  const workplaceTypes = watch("workplaceTypes");
  const searchScope = watch("searchScope");
  const matchStrictness = watch("matchStrictness");
  const searchTerms = watch("searchTerms");
  const searchTermDraft = watch("searchTermDraft");
  const scoringInstructions = watch("scoringInstructions");

  useEffect(() => {
    if (!open) return;
    const memory = loadAutomaticRunMemory();
    const fallbackRunBudget = normalizeRunBudget(
      settings?.jobspyResultsWanted?.value ??
        settings?.startupjobsMaxJobsPerTerm?.value ??
        settings?.jobindexMaxJobsPerTerm?.value ??
        settings?.adzunaMaxJobsPerTerm?.value ??
        settings?.gradcrackerMaxJobsPerTerm?.value ??
        settings?.naukriMaxJobsPerTerm?.value ??
        settings?.ukvisajobsMaxJobs?.value ??
        DEFAULT_VALUES.runBudget,
    );
    const rememberedPresetValues =
      memory?.presetId && memory.presetId !== "custom"
        ? AUTOMATIC_PRESETS[memory.presetId]
        : null;
    const rememberedTopN =
      rememberedPresetValues?.topN ?? memory?.topN ?? DEFAULT_VALUES.topN;
    const rememberedMinSuitabilityScore =
      rememberedPresetValues?.minSuitabilityScore ??
      memory?.minSuitabilityScore ??
      DEFAULT_VALUES.minSuitabilityScore;
    const rememberedRunBudget = normalizeRunBudget(
      rememberedPresetValues?.runBudget ??
        memory?.runBudget ??
        fallbackRunBudget,
    );
    const hasExplicitLocationOverride = Boolean(
      settings?.jobspyCountryIndeed?.override ||
        settings?.searchCities?.override,
    );
    const rememberedCountry = normalizeUiCountryKey(
      settings?.jobspyCountryIndeed?.value ??
        settings?.searchCities?.value ??
        DEFAULT_VALUES.country,
    );
    const detectedCountry = !hasExplicitLocationOverride
      ? getDetectedCountryKey()
      : null;
    const countryValue = rememberedCountry || DEFAULT_VALUES.country;
    const suggestion =
      !countryValue && detectedCountry ? detectedCountry : null;
    const rememberedLocations = parseCityLocationsSetting(
      settings?.searchCities?.value,
    ).filter(
      (location) =>
        normalizeCountryKey(location) !== normalizeCountryKey(countryValue),
    );
    const rememberedWorkplaceTypes = normalizeWorkplaceTypes(
      settings?.workplaceTypes?.value,
    );
    const rememberedSearchScope =
      settings?.locationSearchScope?.value ?? DEFAULT_VALUES.searchScope;
    const rememberedMatchStrictness =
      settings?.locationMatchStrictness?.value ??
      DEFAULT_VALUES.matchStrictness;
    const rememberedLocationMode =
      settings?.locationSearchMode?.override ??
      (rememberedLocations.length > 0 ? "cities" : DEFAULT_VALUES.locationMode);
    const rememberedProximity =
      settings?.locationLatitude?.value != null &&
      settings?.locationLongitude?.value != null
        ? {
            latitude: settings.locationLatitude.value,
            longitude: settings.locationLongitude.value,
            radiusMiles:
              settings.locationRadiusMiles?.value ??
              DEFAULT_VALUES.proximity?.radiusMiles ??
              50,
          }
        : null;

    setBrowserCountrySuggestion(suggestion);
    reset({
      topN: String(rememberedTopN),
      minSuitabilityScore: String(rememberedMinSuitabilityScore),
      runBudget: String(rememberedRunBudget),
      country: countryValue,
      cityLocations: rememberedLocations,
      cityLocationDraft: "",
      locationMode: rememberedLocationMode,
      proximity: rememberedProximity,
      workplaceTypes: rememberedWorkplaceTypes,
      searchScope: rememberedSearchScope,
      matchStrictness: rememberedMatchStrictness,
      searchTerms: settings?.searchTerms?.value ?? DEFAULT_VALUES.searchTerms,
      searchTermDraft: "",
      scoringInstructions: DEFAULT_VALUES.scoringInstructions,
    });
    setSelectedPreset(memory?.presetId ?? "custom");
    setAdvancedOpen(false);
    setPlanSummary(null);
    setPlanWarnings([]);
    setPlanSource(null);
  }, [open, settings, reset]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setAutomaticTab("describe");
      setPlanSummary(null);
      setPlanWarnings([]);
      setPlanSource(null);
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    setSourceDisplayOrder((current) => {
      const filtered = current.filter((source) =>
        enabledSources.includes(source),
      );
      const additions = enabledSources.filter(
        (source) => !filtered.includes(source),
      );
      const next = [...filtered, ...additions];

      return next.length === current.length &&
        next.every((source, index) => source === current[index])
        ? current
        : next;
    });
  }, [enabledSources]);

  const values = useMemo<AutomaticRunValues>(() => {
    const normalizedCountry = normalizeUiCountryKey(countryInput);
    return {
      topN: toNumber(topNInput, 1, 50, DEFAULT_VALUES.topN),
      minSuitabilityScore: toNumber(
        minScoreInput,
        0,
        100,
        DEFAULT_VALUES.minSuitabilityScore,
      ),
      runBudget: toNumber(
        runBudgetInput,
        MIN_PIPELINE_RUN_BUDGET,
        MAX_PIPELINE_RUN_BUDGET,
        DEFAULT_VALUES.runBudget,
      ),
      country: normalizedCountry || DEFAULT_VALUES.country,
      cityLocations,
      locationMode,
      proximity: locationMode === "radius" ? proximity : null,
      workplaceTypes: normalizeWorkplaceTypes(workplaceTypes),
      searchScope,
      matchStrictness,
      searchTerms,
      scoringInstructions: scoringInstructions.trim(),
    };
  }, [
    topNInput,
    minScoreInput,
    runBudgetInput,
    countryInput,
    cityLocations,
    locationMode,
    proximity,
    workplaceTypes,
    searchScope,
    matchStrictness,
    searchTerms,
    scoringInstructions,
  ]);

  const workplaceTypeSelectionInvalid = workplaceTypes.length === 0;

  const locationIntent = useMemo(
    () =>
      createLocationIntent({
        selectedCountry: values.country,
        cityLocations: values.cityLocations,
        proximity: values.proximity,
        workplaceTypes: values.workplaceTypes,
        searchScope: values.searchScope,
        matchStrictness: values.matchStrictness,
      }),
    [
      values.cityLocations,
      values.country,
      values.matchStrictness,
      values.searchScope,
      values.workplaceTypes,
      values.proximity,
    ],
  );

  const sourcePlans = useMemo(
    () =>
      planLocationSources({ intent: locationIntent, sources: enabledSources }),
    [enabledSources, locationIntent],
  );

  const sourcePlanBySource = useMemo(
    () =>
      new Map(
        sourcePlans.plans.map((plan) => [plan.source as JobSource, plan]),
      ),
    [sourcePlans.plans],
  );

  const isSourceAvailableForRun = useCallback(
    (source: JobSource) => sourcePlanBySource.get(source)?.canRun ?? false,
    [sourcePlanBySource],
  );

  const compatibleEnabledSources = useMemo(
    () =>
      sourcePlans.compatibleSources.filter((source): source is JobSource =>
        enabledSources.includes(source as JobSource),
      ),
    [enabledSources, sourcePlans.compatibleSources],
  );

  const compatiblePipelineSources = useMemo(
    () => pipelineSources.filter((source) => isSourceAvailableForRun(source)),
    [pipelineSources, isSourceAvailableForRun],
  );
  const countrySelectionInvalid = values.country.length === 0;
  const sourceRows = useMemo<AutomaticSourcePickerRow[]>(
    () =>
      sourceDisplayOrder.flatMap((source) => {
        const plan = sourcePlanBySource.get(source);
        if (!plan) return [];

        return [
          {
            source,
            selected: pipelineSources.includes(source),
            status: getSourceStatus({
              countrySelected: !countrySelectionInvalid,
              plan,
            }),
          },
        ];
      }),
    [
      countrySelectionInvalid,
      pipelineSources,
      sourceDisplayOrder,
      sourcePlanBySource,
    ],
  );
  const selectedSourceRows = useMemo(
    () => sourceRows.filter((row) => row.selected && row.status.available),
    [sourceRows],
  );
  const readySourceRows = useMemo(
    () => sourceRows.filter((row) => !row.selected && row.status.available),
    [sourceRows],
  );
  const unavailableSourceRows = useMemo(
    () => sourceRows.filter((row) => !row.status.available),
    [sourceRows],
  );
  const countrySuggestion =
    browserCountrySuggestion && browserCountrySuggestion !== values.country
      ? browserCountrySuggestion
      : null;

  useEffect(() => {
    const filtered = pipelineSources.filter((source) =>
      isSourceAvailableForRun(source),
    );
    if (filtered.length === pipelineSources.length) return;
    if (filtered.length > 0) {
      onSetPipelineSources(filtered);
      return;
    }
    if (compatibleEnabledSources.length > 0) {
      onSetPipelineSources([compatibleEnabledSources[0]]);
    }
  }, [
    compatibleEnabledSources,
    isSourceAvailableForRun,
    onSetPipelineSources,
    pipelineSources,
  ]);

  const estimate = useMemo(
    () =>
      calculateAutomaticEstimate({
        values,
        sources: compatiblePipelineSources,
      }),
    [values, compatiblePipelineSources],
  );

  const locationSummary = useMemo(
    () => summarizeLocationPreferences(values),
    [values],
  );
  const selectedSavedSearch = useMemo(
    () =>
      selectedSavedSearchId
        ? (savedSearches.find(
            (search) => search.id === selectedSavedSearchId,
          ) ?? null)
        : null,
    [savedSearches, selectedSavedSearchId],
  );
  const savedSearchSupportEnabled = Boolean(
    onCreateSavedSearch ||
      onUpdateSavedSearch ||
      onDeleteSavedSearch ||
      onApplySavedSearch ||
      savedSearches.length > 0,
  );
  const currentSavedSearchConfig = useMemo<PipelineSearchPresetConfig>(
    () => ({
      searchTerms: values.searchTerms,
      sources: pipelineSources as PipelineSearchPresetConfig["sources"],
      country: values.country,
      cityLocations: values.cityLocations,
      locationMode: values.locationMode,
      proximity: values.proximity,
      workplaceTypes: values.workplaceTypes,
      searchScope: values.searchScope,
      matchStrictness: values.matchStrictness,
      topN: values.topN,
      minSuitabilityScore: values.minSuitabilityScore,
      runBudget: values.runBudget,
      scoringInstructions: values.scoringInstructions,
      automaticPresetId: selectedPreset,
      watchlistSelectedSourceIds: [...selectedWatchlistSourceIds],
    }),
    [pipelineSources, selectedPreset, selectedWatchlistSourceIds, values],
  );

  const runDisabled =
    isPipelineRunning ||
    isSaving ||
    compatiblePipelineSources.length === 0 ||
    values.searchTerms.length === 0 ||
    countrySelectionInvalid ||
    (values.locationMode === "radius" && !values.proximity) ||
    workplaceTypeSelectionInvalid;

  const toggleWorkplaceType = (
    workplaceType: WorkplaceType,
    checked: boolean,
  ) => {
    const next = checked
      ? normalizeWorkplaceTypes([...workplaceTypes, workplaceType])
      : workplaceTypes.filter((value) => value !== workplaceType);

    setValue("workplaceTypes", next, { shouldDirty: true });
  };

  const handleSourceToggle = useCallback(
    (source: JobSource, checked: boolean) => {
      setSourceDisplayOrder((current) => [
        ...current.filter((value) => value !== source),
        source,
      ]);
      onToggleSource(source, checked);
    },
    [onToggleSource],
  );

  const applyPreset = (presetId: AutomaticPresetId) => {
    const preset = AUTOMATIC_PRESETS[presetId];
    setSelectedPreset(presetId);
    setValue("topN", String(preset.topN), { shouldDirty: true });
    setValue("minSuitabilityScore", String(preset.minSuitabilityScore), {
      shouldDirty: true,
    });
    setValue("runBudget", String(preset.runBudget), { shouldDirty: true });
  };

  const handleSaveAndRun = async () => {
    setIsSaving(true);
    try {
      saveAutomaticRunMemory({
        topN: values.topN,
        minSuitabilityScore: values.minSuitabilityScore,
        runBudget: values.runBudget,
        presetId: selectedPreset,
      });
      await onSaveAndRun({
        ...values,
        watchlistSelectedSourceIds: [...selectedWatchlistSourceIds],
      });
    } catch (error) {
      showErrorToast(error, "Failed to start search");
    } finally {
      setIsSaving(false);
    }
  };

  const applySearchConfig = (config: PipelineSearchPresetConfig) => {
    setSelectedPreset(config.automaticPresetId ?? "custom");
    setValue("topN", String(config.topN), { shouldDirty: true });
    setValue("minSuitabilityScore", String(config.minSuitabilityScore), {
      shouldDirty: true,
    });
    setValue("runBudget", String(normalizeRunBudget(config.runBudget)), {
      shouldDirty: true,
    });
    setValue("country", normalizeUiCountryKey(config.country), {
      shouldDirty: true,
    });
    setValue("cityLocations", config.cityLocations, { shouldDirty: true });
    setValue("cityLocationDraft", "");
    setValue(
      "locationMode",
      config.locationMode ?? (config.proximity ? "radius" : "cities"),
      { shouldDirty: true },
    );
    setValue("proximity", config.proximity ?? null, { shouldDirty: true });
    setValue("workplaceTypes", normalizeWorkplaceTypes(config.workplaceTypes), {
      shouldDirty: true,
    });
    setValue("searchScope", config.searchScope, { shouldDirty: true });
    setValue("matchStrictness", config.matchStrictness, { shouldDirty: true });
    setValue("searchTerms", config.searchTerms, { shouldDirty: true });
    setValue("searchTermDraft", "");
    setValue("scoringInstructions", config.scoringInstructions ?? "", {
      shouldDirty: true,
    });

    const nextSources = config.sources.filter((source) =>
      enabledSources.includes(source),
    );
    if (nextSources.length > 0) {
      onSetPipelineSources(nextSources);
    }

    if (Array.isArray(config.watchlistSelectedSourceIds)) {
      const availableIds = new Set(watchlistSources.map((source) => source.id));
      const restored = config.watchlistSelectedSourceIds.filter((id) =>
        availableIds.has(id),
      );
      onSetSelectedWatchlistSourceIds?.(restored);
    }
  };

  const applySavedSearch = async (preset: PipelineSearchPreset) => {
    setSelectedSavedSearchId(preset.id);
    applySearchConfig(preset.config);
    await onApplySavedSearch?.(preset);
  };

  const handleGenerateSearchPlan = async () => {
    const prompt = searchPrompt.trim();
    if (!prompt) return;

    setIsPlanningSearch(true);
    try {
      const result = await api.planPipelineSearch({
        prompt,
        currentConfig: currentSavedSearchConfig,
      });
      applySearchConfig(result.config);
      setSelectedSavedSearchId(null);
      setPlanSummary(result.summary);
      setPlanWarnings(result.warnings);
      setPlanSource(result.source);
      setAutomaticTab("details");
    } catch (error) {
      showErrorToast(error, "Failed to generate search settings");
    } finally {
      setIsPlanningSearch(false);
    }
  };

  const openSaveDialog = (mode: "create" | "update") => {
    setSaveDialogMode(mode);
    setSaveName(mode === "update" ? (selectedSavedSearch?.name ?? "") : "");
    setSaveDialogOpen(true);
  };

  const handleSaveSearch = async () => {
    const name = saveName.trim();
    if (!name) return;

    setIsSavingSearch(true);
    try {
      if (saveDialogMode === "update" && selectedSavedSearch) {
        await onUpdateSavedSearch?.(selectedSavedSearch.id, {
          name,
          config: currentSavedSearchConfig,
        });
        setSelectedSavedSearchId(selectedSavedSearch.id);
      } else if (onCreateSavedSearch) {
        const created = await onCreateSavedSearch({
          name,
          config: currentSavedSearchConfig,
        });
        setSelectedSavedSearchId(created.id);
      }
      setSaveDialogOpen(false);
    } finally {
      setIsSavingSearch(false);
    }
  };

  const handleDeleteSelectedSearch = async () => {
    if (!selectedSavedSearch || !onDeleteSavedSearch) return;
    const id = selectedSavedSearch.id;
    await onDeleteSavedSearch(id);
    setSelectedSavedSearchId(null);
  };

  useEffect(() => {
    if (!selectedSavedSearchId) return;
    if (savedSearches.some((search) => search.id === selectedSavedSearchId)) {
      return;
    }
    setSelectedSavedSearchId(null);
  }, [savedSearches, selectedSavedSearchId]);

  const countryOptions = useMemo(
    () =>
      SUPPORTED_COUNTRY_KEYS.filter(
        (country) => !HIDDEN_COUNTRY_KEYS.has(country),
      ).map((country) => ({
        value: country,
        label: formatCountryLabel(country),
      })),
    [],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <AutomaticSaveSearchDialog
        open={saveDialogOpen}
        mode={saveDialogMode}
        name={saveName}
        isSaving={isSavingSearch}
        onOpenChange={setSaveDialogOpen}
        onNameChange={setSaveName}
        onSave={() => void handleSaveSearch()}
      />

      <Tabs
        value={automaticTab}
        onValueChange={(value) =>
          setAutomaticTab(value === "details" ? "details" : "describe")
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="sr-only">
          <TabsTrigger value="describe">Describe search</TabsTrigger>
          <TabsTrigger value="details">Configure details</TabsTrigger>
        </TabsList>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto",
            automaticTab === "details" && "pr-1",
          )}
        >
          <TabsContent
            value="describe"
            className="mt-0 flex min-h-0 flex-1 flex-col items-center py-10 sm:py-14"
          >
            <AutomaticSearchPrompt
              searchPrompt={searchPrompt}
              isPlanningSearch={isPlanningSearch}
              planSummary={planSummary}
              planWarnings={planWarnings}
              planSource={planSource}
              onSearchPromptChange={setSearchPrompt}
              onGenerateSearchPlan={() => void handleGenerateSearchPlan()}
              onConfigureManually={() => setAutomaticTab("details")}
            />
          </TabsContent>

          <TabsContent value="details" className="mt-0 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => setAutomaticTab("describe")}
              >
                <ArrowLeft className="h-4 w-4" />
                Describe search
              </Button>
              <p className="text-sm font-medium text-muted-foreground">
                Configure details
              </p>
            </div>

            {planSummary ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertTitle>
                  {planSource === "fallback"
                    ? "Current settings kept"
                    : "Review generated settings"}
                </AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>{planSummary}</p>
                  {planWarnings.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {planWarnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}

            {savedSearchSupportEnabled ? (
              <AutomaticSavedSearchControls
                savedSearches={savedSearches}
                selectedSavedSearch={selectedSavedSearch}
                selectedSavedSearchId={selectedSavedSearchId}
                isLoading={isSavedSearchesLoading}
                canCreate={Boolean(onCreateSavedSearch)}
                canUpdate={Boolean(onUpdateSavedSearch)}
                canDelete={Boolean(onDeleteSavedSearch)}
                onApplySavedSearch={(preset) => void applySavedSearch(preset)}
                onOpenSaveDialog={openSaveDialog}
                onDeleteSelectedSearch={() => void handleDeleteSelectedSearch()}
              />
            ) : null}

            <AutomaticRunSettingsCard
              selectedPreset={selectedPreset}
              values={values}
              locationSummary={locationSummary}
              countryOptions={countryOptions}
              countrySuggestion={countrySuggestion}
              countrySelectionInvalid={countrySelectionInvalid}
              cityLocationDraft={cityLocationDraft}
              workplaceTypes={workplaceTypes}
              workplaceTypeSelectionInvalid={workplaceTypeSelectionInvalid}
              searchScope={searchScope}
              matchStrictness={matchStrictness}
              advancedOpen={advancedOpen}
              topNInput={topNInput}
              minScoreInput={minScoreInput}
              runBudgetInput={runBudgetInput}
              minRunBudget={MIN_PIPELINE_RUN_BUDGET}
              maxRunBudget={MAX_PIPELINE_RUN_BUDGET}
              onApplyPreset={applyPreset}
              onSelectCustomPreset={() => setSelectedPreset("custom")}
              onCountryChange={(country) => {
                setValue("country", country, { shouldDirty: true });
                if (normalizeUiCountryKey(country) !== values.country) {
                  setValue("proximity", null, { shouldDirty: true });
                }
              }}
              onUseCountrySuggestion={() => {
                if (!countrySuggestion) return;
                setValue("country", countrySuggestion, { shouldDirty: true });
                setValue("proximity", null, { shouldDirty: true });
              }}
              onCityLocationDraftChange={(value) =>
                setValue("cityLocationDraft", value)
              }
              onCityLocationsChange={(value) =>
                setValue("cityLocations", value, { shouldDirty: true })
              }
              onLocationModeChange={(value) =>
                setValue("locationMode", value, { shouldDirty: true })
              }
              onProximityChange={(value) =>
                setValue("proximity", value, { shouldDirty: true })
              }
              onToggleWorkplaceType={toggleWorkplaceType}
              onSearchScopeChange={(value) =>
                setValue("searchScope", value, { shouldDirty: true })
              }
              onMatchStrictnessChange={(value) =>
                setValue("matchStrictness", value, { shouldDirty: true })
              }
              onAdvancedOpenChange={setAdvancedOpen}
              onTopNInputChange={(value) => {
                setSelectedPreset("custom");
                setValue("topN", value);
              }}
              onMinScoreInputChange={(value) => {
                setSelectedPreset("custom");
                setValue("minSuitabilityScore", value);
              }}
              onRunBudgetInputChange={(value) => {
                setSelectedPreset("custom");
                setValue("runBudget", value);
              }}
              onRunBudgetInputBlur={() =>
                setValue(
                  "runBudget",
                  String(
                    normalizeRunBudget(
                      Number.parseInt(runBudgetInput, 10) ||
                        DEFAULT_VALUES.runBudget,
                    ),
                  ),
                )
              }
            />

            <AutomaticRankingPreferencesCard
              scoringInstructions={scoringInstructions}
              onScoringInstructionsChange={(value) =>
                setValue("scoringInstructions", value, { shouldDirty: true })
              }
            />

            <AutomaticSearchTermsCard
              searchTerms={searchTerms}
              searchTermDraft={searchTermDraft}
              onSearchTermDraftChange={(value) =>
                setValue("searchTermDraft", value)
              }
              onSearchTermsChange={(value) =>
                setValue("searchTerms", value, { shouldDirty: true })
              }
            />

            <AutomaticSourcePickerCard
              sourceRows={sourceRows}
              selectedSourceRows={selectedSourceRows}
              readySourceRows={readySourceRows}
              unavailableSourceRows={unavailableSourceRows}
              watchlistSources={watchlistSources}
              selectedWatchlistSourceIds={selectedWatchlistSourceIds}
              isWatchlistSourcesLoading={isWatchlistSourcesLoading}
              onSourceToggle={handleSourceToggle}
              onWatchlistSourceToggle={onToggleWatchlistSource}
            />
          </TabsContent>
        </div>
      </Tabs>

      {automaticTab === "details" ? (
        <AutomaticRunFooter
          discoveredMin={estimate.discovered.min}
          discoveredMax={estimate.discovered.max}
          resumeCount={values.topN}
          isSaving={isSaving}
          disabled={runDisabled}
          onRunSearch={() => void handleSaveAndRun()}
        />
      ) : null}
    </div>
  );
};
