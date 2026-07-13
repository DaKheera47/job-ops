import * as api from "@client/api";
import { fileToDataUrl } from "@client/components/design-resume/utils";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useRxResumeConfigState } from "@client/hooks/useRxResumeConfigState";
import { useSettings } from "@client/hooks/useSettings";
import { queryKeys } from "@client/lib/queryKeys";
import { normalizeLlmProvider } from "@client/pages/settings/utils";
import type { AppSettings, OnboardingStatusResponse } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { showErrorToast } from "@/client/lib/error-toast";
import { bucketCount, trackProductEvent } from "@/lib/analytics";
import {
  getDurationBucket,
  getEndpointMode,
  getErrorCategory,
  getFileSizeBucket,
  getFileType,
  getHttpStatusBucket,
} from "./analytics";
import type { OnboardingFormData, ResumeSetupMode } from "./types";

export function useOnboardingFlow() {
  const queryClient = useQueryClient();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { setBaseResumeId, syncBaseResumeId } =
    useRxResumeConfigState(settings);
  const demoInfo = useDemoInfo();
  const demoMode = demoInfo?.demoMode ?? false;

  const [isSaving, setIsSaving] = useState(false);
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
      pdfRenderer: "typst",
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
      pdfRenderer: selectedId ? "rxresume" : "typst",
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
    const provider = selectedProvider;

    trackProductEvent("onboarding_model_verify_submitted", {
      provider,
      endpoint_mode: getEndpointMode(values.llmBaseUrl),
      has_key_input: Boolean(values.llmApiKey.trim()),
      has_model_input: Boolean(values.model.trim()),
    });

    try {
      setIsSaving(true);
      const status = await api.saveOnboardingModel({
        provider,
        baseUrl: values.llmBaseUrl.trim() || null,
        apiKey: values.llmApiKey.trim() || null,
        model: values.model.trim() || null,
      });
      await refreshOnboardingState(status);
      trackProductEvent("onboarding_model_verify_completed", {
        result: "success",
        provider,
      });
      toast.success("Model connection verified");
      return status;
    } catch (error) {
      trackProductEvent("onboarding_model_verify_completed", {
        result: "error",
        provider,
        error_category: getErrorCategory(error),
        http_status_bucket: getHttpStatusBucket(error),
      });
      showErrorToast(error, "Failed to verify model connection");
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [getValues, refreshOnboardingState, selectedProvider]);

  const handleSaveRxresume = useCallback(async () => {
    const values = getValues();
    const selfHosted = isRxResumeSelfHosted;

    trackProductEvent("onboarding_rxresume_verify_submitted", {
      self_hosted: selfHosted,
      has_key_input: Boolean(values.rxresumeApiKey.trim()),
      endpoint_mode: selfHosted
        ? getEndpointMode(values.rxresumeUrl)
        : "default",
    });

    try {
      setIsSaving(true);
      const status = await api.saveOnboardingRxResume({
        apiKey: values.rxresumeApiKey.trim() || null,
        baseUrl: selfHosted ? values.rxresumeUrl.trim() || null : null,
        rxresumeBaseResumeId: values.rxresumeBaseResumeId,
      });
      setValue("rxresumeApiKey", "");
      await refreshOnboardingState(status);
      trackProductEvent("onboarding_rxresume_verify_completed", {
        result: "success",
        self_hosted: selfHosted,
      });
      toast.success(
        status.complete ? "Resume source verified" : "Reactive Resume saved",
      );
      return status;
    } catch (error) {
      trackProductEvent("onboarding_rxresume_verify_completed", {
        result: "error",
        self_hosted: selfHosted,
        error_category: getErrorCategory(error),
        http_status_bucket: getHttpStatusBucket(error),
      });
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

  const handleResumeSetupModeChange = useCallback(
    (mode: ResumeSetupMode) => {
      resumeSetupModeTouchedRef.current = true;
      trackProductEvent("onboarding_resume_mode_selected", {
        mode,
        had_existing_resume: Boolean(getValues().rxresumeBaseResumeId),
      });
      setResumeSetupMode(mode);
    },
    [getValues],
  );

  const handleImportResumeFile = useCallback(
    async (file: File) => {
      const startedAt = Date.now();
      const fileType = getFileType(file);
      trackProductEvent("onboarding_resume_upload_submitted", {
        file_type: fileType,
        file_size_bucket: getFileSizeBucket(file),
        was_reimport: Boolean(settings?.pdfRenderer?.value),
      });

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

        if (settings?.pdfRenderer?.value !== "typst") {
          const nextSettings = await api.updateSettings({
            pdfRenderer: "typst",
          });
          syncSettingsCache(nextSettings);
          setValue("pdfRenderer", "typst");
        }

        await refreshOnboardingState();
        trackProductEvent("onboarding_resume_upload_completed", {
          result: "success",
          file_type: fileType,
          duration_bucket: getDurationBucket(startedAt),
          section_count_bucket: bucketCount(
            Object.keys(
              ((document as { sections?: Record<string, unknown> }).sections ??
                {}) as Record<string, unknown>,
            ).length,
          ),
        });
        toast.success("Resume uploaded", {
          description:
            settings?.pdfRenderer?.value === "typst"
              ? "Your local Resume Studio document is ready."
              : "Your local Resume Studio document is ready and PDF rendering was switched to Typst.",
        });
      } catch (error) {
        trackProductEvent("onboarding_resume_upload_completed", {
          result: "error",
          file_type: fileType,
          duration_bucket: getDurationBucket(startedAt),
          error_category: getErrorCategory(error),
        });
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

      trackProductEvent("onboarding_rxresume_template_selected", {
        had_previous_template: Boolean(currentValue),
        selection_result: value ? "selected" : "cleared",
      });
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

  const isBusy = isSaving || settingsLoading || isImportingResume;

  return {
    demoMode,
    handleImportResumeFile,
    handleRxresumeSelfHostedChange,
    handleSaveModel,
    handleSaveRxresume,
    handleTemplateResumeChange,
    isBusy,
    isImportingResume,
    importingResumeFileName,
    isRxResumeSelfHosted,
    llmKeyHint: settings?.llmApiKeyHint ?? null,
    resumeSetupMode,
    rxresumeApiKeyHint: settings?.rxresumeApiKeyHint,
    selectedProvider,
    settings,
    settingsLoading,
    setResumeSetupMode: handleResumeSetupModeChange,
    setValue,
    watch,
  };
}
