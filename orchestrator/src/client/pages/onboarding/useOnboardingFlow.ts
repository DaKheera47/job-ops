import * as api from "@client/api";
import { fileToDataUrl } from "@client/components/design-resume/utils";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useRxResumeConfigState } from "@client/hooks/useRxResumeConfigState";
import { useSettings } from "@client/hooks/useSettings";
import { queryKeys } from "@client/lib/queryKeys";
import { normalizeLlmProvider } from "@client/pages/settings/utils";
import type {
  AppSettings,
  OnboardingStatusResponse,
  SearchTermsSuggestionResponse,
} from "@shared/types";
import { normalizeSearchTerms } from "@shared/utils/search-terms";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import type { OnboardingFormData, ResumeSetupMode } from "./types";

export function useOnboardingFlow() {
  const queryClient = useQueryClient();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { setBaseResumeId, syncBaseResumeId } =
    useRxResumeConfigState(settings);
  const demoInfo = useDemoInfo();
  const demoMode = demoInfo?.demoMode ?? false;

  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingSearchTerms, setIsGeneratingSearchTerms] = useState(false);
  const [preparedSearchTerms, setPreparedSearchTerms] = useState<string[]>([]);
  const [searchTermsSource, setSearchTermsSource] = useState<
    SearchTermsSuggestionResponse["source"] | null
  >(null);
  const [isImportingResume, setIsImportingResume] = useState(false);
  const [importingResumeFileName, setImportingResumeFileName] = useState<
    string | null
  >(null);
  const [isRxResumeSelfHosted, setIsRxResumeSelfHosted] = useState(false);
  const [resumeSetupMode, setResumeSetupMode] =
    useState<ResumeSetupMode>("upload");
  const resumeSetupModeTouchedRef = useRef(false);

  const { getValues, reset, setValue, watch } = useForm<OnboardingFormData>({
    defaultValues: {
      llmProvider: "",
      llmBaseUrl: "",
      llmApiKey: "",
      model: "",
      pdfRenderer: "latex",
      rxresumeUrl: "",
      rxresumeApiKey: "",
      rxresumeBaseResumeId: null,
    },
  });

  const syncSettingsCache = useCallback(
    (nextSettings: AppSettings) => {
      queryClient.setQueryData(queryKeys.settings.current(), nextSettings);
    },
    [queryClient],
  );

  const refreshOnboardingState = useCallback(
    async (status?: OnboardingStatusResponse) => {
      if (status) {
        queryClient.setQueryData(queryKeys.onboarding.status(), status);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.settings.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.designResume.all }),
      ]);
    },
    [queryClient],
  );

  useEffect(() => {
    if (!settings) return;

    const selectedId = syncBaseResumeId();
    reset({
      llmProvider: settings.llmProvider?.value || "",
      llmBaseUrl: settings.llmBaseUrl?.value || "",
      llmApiKey: "",
      model: settings.model?.override ?? "",
      pdfRenderer: selectedId ? "rxresume" : "latex",
      rxresumeUrl: settings.rxresumeUrl ?? "",
      rxresumeApiKey: "",
      rxresumeBaseResumeId: selectedId,
    });
    setIsRxResumeSelfHosted(Boolean(settings.rxresumeUrl));
    if (!resumeSetupModeTouchedRef.current) {
      setResumeSetupMode(selectedId ? "rxresume" : "upload");
    }
  }, [reset, settings, syncBaseResumeId]);

  const llmProvider = watch("llmProvider");
  const selectedProvider = normalizeLlmProvider(
    llmProvider || settings?.llmProvider?.value || "openrouter",
  );

  const handleSaveModel = useCallback(async () => {
    const values = getValues();

    try {
      setIsSaving(true);
      const status = await api.saveOnboardingModel({
        provider: selectedProvider,
        baseUrl: values.llmBaseUrl.trim() || null,
        apiKey: values.llmApiKey.trim() || null,
        model: values.model.trim() || null,
      });
      await refreshOnboardingState(status);
      toast.success("Model connection verified");
      return status;
    } catch (error) {
      showErrorToast(error, "Failed to verify model connection");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [getValues, refreshOnboardingState, selectedProvider]);

  const handleSaveRxresume = useCallback(async () => {
    const values = getValues();

    try {
      setIsSaving(true);
      const status = await api.saveOnboardingRxResume({
        apiKey: values.rxresumeApiKey.trim() || null,
        baseUrl: isRxResumeSelfHosted
          ? values.rxresumeUrl.trim() || null
          : null,
        rxresumeBaseResumeId: values.rxresumeBaseResumeId,
      });
      setValue("rxresumeApiKey", "");
      await refreshOnboardingState(status);
      toast.success(
        status.complete ? "Resume source verified" : "Reactive Resume saved",
      );
      return status;
    } catch (error) {
      showErrorToast(error, "Failed to save Reactive Resume");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [getValues, isRxResumeSelfHosted, refreshOnboardingState, setValue]);

  const handleRxresumeSelfHostedChange = useCallback(
    (next: boolean) => {
      setIsRxResumeSelfHosted(next);
      if (!next) {
        setValue("rxresumeUrl", "");
      }
    },
    [setValue],
  );

  const handleResumeSetupModeChange = useCallback((mode: ResumeSetupMode) => {
    resumeSetupModeTouchedRef.current = true;
    setResumeSetupMode(mode);
  }, []);

  const handleImportResumeFile = useCallback(
    async (file: File) => {
      try {
        setImportingResumeFileName(file.name);
        setIsImportingResume(true);
        const dataUrl = await fileToDataUrl(file);
        const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl.trim());

        if (!match) {
          throw new Error("Resume file could not be encoded for upload.");
        }

        const document = await api.importDesignResumeFromFile({
          fileName: file.name,
          mediaType: file.type || match[1],
          dataBase64: match[2],
        });

        queryClient.setQueryData(queryKeys.designResume.current(), document);
        queryClient.setQueryData(queryKeys.designResume.status(), {
          exists: true,
          documentId: document.id,
          updatedAt: document.updatedAt,
        });

        if (settings?.pdfRenderer?.value !== "latex") {
          const nextSettings = await api.updateSettings({
            pdfRenderer: "latex",
          });
          syncSettingsCache(nextSettings);
          setValue("pdfRenderer", "latex");
        }

        await refreshOnboardingState();
        toast.success("Resume uploaded", {
          description:
            settings?.pdfRenderer?.value === "latex"
              ? "Your local Resume Studio document is ready."
              : "Your local Resume Studio document is ready and PDF rendering was switched to LaTeX.",
        });
      } catch (error) {
        showErrorToast(error, "Failed to import resume file");
      } finally {
        setIsImportingResume(false);
        setImportingResumeFileName(null);
      }
    },
    [
      queryClient,
      refreshOnboardingState,
      settings?.pdfRenderer?.value,
      setValue,
      syncSettingsCache,
    ],
  );

  const handleTemplateResumeChange = useCallback(
    (value: string | null) => {
      const currentValue = getValues().rxresumeBaseResumeId;
      if (currentValue === value) return;

      setBaseResumeId(value);
      setValue("rxresumeBaseResumeId", value);

      void (async () => {
        try {
          setIsSaving(true);
          const status = await api.saveOnboardingRxResume({
            rxresumeBaseResumeId: value,
          });
          await refreshOnboardingState(status);
          toast.success(
            status.complete
              ? "Resume source verified"
              : "Template saved. Recheck the resume source to continue.",
          );
        } catch (error) {
          setBaseResumeId(currentValue);
          setValue("rxresumeBaseResumeId", currentValue);
          showErrorToast(error, "Failed to save selected resume");
        } finally {
          setIsSaving(false);
        }
      })();
    },
    [getValues, refreshOnboardingState, setBaseResumeId, setValue],
  );

  const savedSearchTerms = normalizeSearchTerms(
    settings?.searchTerms?.override ?? preparedSearchTerms,
  );
  const hasSavedSearchTerms = savedSearchTerms.length > 0;

  const ensureSearchTerms = useCallback(
    async (options?: { force?: boolean }) => {
      if (!options?.force && hasSavedSearchTerms) {
        return true;
      }

      try {
        setIsGeneratingSearchTerms(true);
        const suggestion = await api.suggestOnboardingSearchTerms();
        const terms = normalizeSearchTerms(suggestion.terms);
        if (terms.length === 0) {
          throw new Error("No usable search terms were generated.");
        }

        const nextSettings = await api.updateSettings({ searchTerms: terms });
        syncSettingsCache(nextSettings);
        setPreparedSearchTerms(terms);
        setSearchTermsSource(suggestion.source);
        toast.success("Search terms prepared", {
          description: `${terms.length} resume-based title${
            terms.length === 1 ? "" : "s"
          } saved for job discovery.`,
        });
        return true;
      } catch (error) {
        showErrorToast(error, "Failed to prepare search terms");
        return false;
      } finally {
        setIsGeneratingSearchTerms(false);
      }
    },
    [hasSavedSearchTerms, syncSettingsCache],
  );

  const isBusy = isSaving || settingsLoading || isImportingResume;

  return {
    demoMode,
    ensureSearchTerms,
    handleImportResumeFile,
    handleRxresumeSelfHostedChange,
    handleSaveModel,
    handleSaveRxresume,
    handleTemplateResumeChange,
    isBusy,
    isGeneratingSearchTerms,
    isImportingResume,
    importingResumeFileName,
    isRxResumeSelfHosted,
    llmKeyHint: settings?.llmApiKeyHint ?? null,
    resumeSetupMode,
    rxresumeApiKeyHint: settings?.rxresumeApiKeyHint,
    selectedProvider,
    settings,
    settingsLoading,
    hasSavedSearchTerms,
    savedSearchTerms,
    searchTermsSource,
    setResumeSetupMode: handleResumeSetupModeChange,
    setValue,
    watch,
  };
}
