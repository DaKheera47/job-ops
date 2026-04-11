import { ReactiveResumeConfigPanel } from "@client/components/ReactiveResumeConfigPanel";
import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type { PdfRenderer, ResumeProjectCatalogItem } from "@shared/types.js";
import type React from "react";
import {
  type Path,
  type PathValue,
  useFormContext,
  useWatch,
} from "react-hook-form";

type ReactiveResumeSectionProps = {
  rxResumeBaseResumeIdDraft: string | null;
  setRxResumeBaseResumeIdDraft: (value: string | null) => void;
  // True when v5 API key is configured.
  hasRxResumeAccess: boolean;
  onCredentialFieldEdit?: () => void;
  validationStatus?: {
    checked: boolean;
    valid: boolean;
    message?: string | null;
    status?: number | null;
  };
  profileProjects: ResumeProjectCatalogItem[];
  lockedCount: number;
  maxProjectsTotal: number;
  isProjectsLoading: boolean;
  isLoading: boolean;
  isSaving: boolean;
  layoutMode?: "accordion" | "panel";
};

export const ReactiveResumeSection: React.FC<ReactiveResumeSectionProps> = ({
  rxResumeBaseResumeIdDraft,
  setRxResumeBaseResumeIdDraft,
  hasRxResumeAccess,
  onCredentialFieldEdit,
  validationStatus,
  profileProjects,
  lockedCount,
  maxProjectsTotal,
  isProjectsLoading,
  isLoading,
  isSaving,
  layoutMode,
}) => {
  const {
    control,
    clearErrors,
    setValue,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  const pdfRendererValue = (useWatch({
    control,
    name: "pdfRenderer",
  }) ?? "rxresume") as PdfRenderer;
  const rxresumeApiKeyValue =
    useWatch({ control, name: "rxresumeApiKey" }) ?? "";
  const rxresumeUrlValue = useWatch({ control, name: "rxresumeUrl" }) ?? "";
  const resumeProjectsValue = useWatch({ control, name: "resumeProjects" });
  const setDirtyTouchedValue = <TField extends Path<UpdateSettingsInput>>(
    field: TField,
    value: PathValue<UpdateSettingsInput, TField>,
  ) =>
    setValue(field, value, {
      shouldDirty: true,
      shouldTouch: true,
    });

  const clearRxResumeFeedback = () => {
    onCredentialFieldEdit?.();
    clearErrors(["rxresumeApiKey", "rxresumeUrl"]);
  };

  return (
    <SettingsSectionFrame
      mode={layoutMode}
      title="Reactive Resume"
      value="reactive-resume"
    >
      <ReactiveResumeConfigPanel
        pdfRenderer={pdfRendererValue}
        onPdfRendererChange={(value) =>
          setDirtyTouchedValue("pdfRenderer", value)
        }
        pdfRendererError={errors.pdfRenderer?.message as string | undefined}
        disabled={isLoading || isSaving}
        hasRxResumeAccess={hasRxResumeAccess}
        showValidationStatus={Boolean(validationStatus)}
        validationStatus={validationStatus}
        shared={{
          baseUrl: rxresumeUrlValue,
          onBaseUrlChange: (value) => {
            clearRxResumeFeedback();
            setDirtyTouchedValue("rxresumeUrl", value);
          },
          baseUrlError: errors.rxresumeUrl?.message as string | undefined,
        }}
        v5={{
          apiKey: rxresumeApiKeyValue,
          onApiKeyChange: (value) => {
            clearRxResumeFeedback();
            setDirtyTouchedValue("rxresumeApiKey", value);
          },
          error: errors.rxresumeApiKey?.message as string | undefined,
        }}
        projectSelection={{
          baseResumeId: rxResumeBaseResumeIdDraft,
          onBaseResumeIdChange: setRxResumeBaseResumeIdDraft,
          projects: profileProjects,
          value: resumeProjectsValue,
          onChange: (next) => setDirtyTouchedValue("resumeProjects", next),
          lockedCount,
          maxProjectsTotal,
          isProjectsLoading,
          disabled: isLoading || isSaving,
          maxProjectsError:
            errors.resumeProjects?.maxProjects?.message?.toString(),
        }}
      />
    </SettingsSectionFrame>
  );
};
