import { ReactiveResumeConfigPanel } from "@client/components/ReactiveResumeConfigPanel";
import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type {
  PdfRenderer,
  ResumeProjectCatalogItem,
  RxResumeMode,
} from "@shared/types.js";
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
  // True when v4 credentials or v5 API key are configured.
  hasRxResumeAccess: boolean;
  rxresumeMode: RxResumeMode;
  onRxresumeModeChange?: (mode: RxResumeMode) => void;
  onCredentialFieldEdit?: (mode: RxResumeMode) => void;
  validationStatuses?: {
    v4: {
      checked: boolean;
      valid: boolean;
      message?: string | null;
      status?: number | null;
    };
    v5: {
      checked: boolean;
      valid: boolean;
      message?: string | null;
      status?: number | null;
    };
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
  rxresumeMode,
  onRxresumeModeChange,
  onCredentialFieldEdit,
  validationStatuses,
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
  const selectedMode =
    useWatch({ control, name: "rxresumeMode" }) ?? rxresumeMode ?? "v5";
  const pdfRendererValue = (useWatch({
    control,
    name: "pdfRenderer",
  }) ?? "rxresume") as PdfRenderer;
  const rxresumeApiKeyValue =
    useWatch({ control, name: "rxresumeApiKey" }) ?? "";
  const rxresumeEmailValue = useWatch({ control, name: "rxresumeEmail" }) ?? "";
  const rxresumeUrlValue = useWatch({ control, name: "rxresumeUrl" }) ?? "";
  const rxresumePasswordValue =
    useWatch({ control, name: "rxresumePassword" }) ?? "";
  const resumeProjectsValue = useWatch({ control, name: "resumeProjects" });
  const setDirtyTouchedValue = <TField extends Path<UpdateSettingsInput>>(
    field: TField,
    value: PathValue<UpdateSettingsInput, TField>,
  ) =>
    setValue(field, value, {
      shouldDirty: true,
      shouldTouch: true,
    });

  const clearRxResumeFeedback = (mode: RxResumeMode) => {
    onCredentialFieldEdit?.(mode);
    clearErrors(
      mode === "v5"
        ? ["rxresumeApiKey", "rxresumeUrl"]
        : ["rxresumeEmail", "rxresumePassword", "rxresumeUrl"],
    );
  };

  return (
    <SettingsSectionFrame
      mode={layoutMode}
      title="Reactive Resume"
      value="reactive-resume"
    >
      <ReactiveResumeConfigPanel
        mode={selectedMode}
        onModeChange={(mode) => {
          onRxresumeModeChange?.(mode);
          setDirtyTouchedValue("rxresumeMode", mode);
        }}
        pdfRenderer={pdfRendererValue}
        onPdfRendererChange={(value) =>
          setDirtyTouchedValue("pdfRenderer", value)
        }
        pdfRendererError={errors.pdfRenderer?.message as string | undefined}
        disabled={isLoading || isSaving}
        hasRxResumeAccess={hasRxResumeAccess}
        showValidationStatus={Boolean(validationStatuses)}
        validationStatuses={validationStatuses}
        shared={{
          baseUrl: rxresumeUrlValue,
          onBaseUrlChange: (value) => {
            clearRxResumeFeedback(selectedMode);
            setDirtyTouchedValue("rxresumeUrl", value);
          },
          baseUrlError: errors.rxresumeUrl?.message as string | undefined,
        }}
        v5={{
          apiKey: rxresumeApiKeyValue,
          onApiKeyChange: (value) => {
            clearRxResumeFeedback("v5");
            setDirtyTouchedValue("rxresumeApiKey", value);
          },
          error: errors.rxresumeApiKey?.message as string | undefined,
        }}
        v4={{
          email: rxresumeEmailValue,
          onEmailChange: (value) => {
            clearRxResumeFeedback("v4");
            setDirtyTouchedValue("rxresumeEmail", value);
          },
          emailError: errors.rxresumeEmail?.message as string | undefined,
          password: rxresumePasswordValue,
          onPasswordChange: (value) => {
            clearRxResumeFeedback("v4");
            setDirtyTouchedValue("rxresumePassword", value);
          },
          passwordError: errors.rxresumePassword?.message as string | undefined,
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
