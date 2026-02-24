import { ReactiveResumeConfigPanel } from "@client/components/ReactiveResumeConfigPanel";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type { ResumeProjectCatalogItem, RxResumeMode } from "@shared/types.js";
import type React from "react";
import {
  type Path,
  type PathValue,
  useFormContext,
  useWatch,
} from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type ReactiveResumeSectionProps = {
  rxResumeBaseResumeIdDraft: string | null;
  setRxResumeBaseResumeIdDraft: (value: string | null) => void;
  // True when v4 credentials or v5 API key are configured.
  hasRxResumeAccess: boolean;
  rxresumeMode: RxResumeMode;
  onRxresumeModeChange?: (mode: RxResumeMode) => void;
  validationStatuses?: {
    v4: { checked: boolean; valid: boolean; message?: string | null };
    v5: { checked: boolean; valid: boolean; message?: string | null };
  };
  profileProjects: ResumeProjectCatalogItem[];
  lockedCount: number;
  maxProjectsTotal: number;
  isProjectsLoading: boolean;
  isLoading: boolean;
  isSaving: boolean;
};

export const ReactiveResumeSection: React.FC<ReactiveResumeSectionProps> = ({
  rxResumeBaseResumeIdDraft,
  setRxResumeBaseResumeIdDraft,
  hasRxResumeAccess,
  rxresumeMode,
  onRxresumeModeChange,
  validationStatuses,
  profileProjects,
  lockedCount,
  maxProjectsTotal,
  isProjectsLoading,
  isLoading,
  isSaving,
}) => {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();
  const selectedMode =
    useWatch({ control, name: "rxresumeMode" }) ?? rxresumeMode ?? "v5";
  const rxresumeApiKeyValue =
    useWatch({ control, name: "rxresumeApiKey" }) ?? "";
  const rxresumeEmailValue = useWatch({ control, name: "rxresumeEmail" }) ?? "";
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

  return (
    <AccordionItem value="reactive-resume" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Reactive Resume</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <ReactiveResumeConfigPanel
          mode={selectedMode}
          onModeChange={(mode) => {
            onRxresumeModeChange?.(mode);
            setDirtyTouchedValue("rxresumeMode", mode);
          }}
          disabled={isLoading || isSaving}
          hasRxResumeAccess={hasRxResumeAccess}
          showValidationStatus={Boolean(validationStatuses)}
          validationStatuses={validationStatuses}
          v5={{
            apiKey: rxresumeApiKeyValue,
            onApiKeyChange: (value) =>
              setDirtyTouchedValue("rxresumeApiKey", value),
            error: errors.rxresumeApiKey?.message as string | undefined,
          }}
          v4={{
            email: rxresumeEmailValue,
            onEmailChange: (value) =>
              setDirtyTouchedValue("rxresumeEmail", value),
            emailError: errors.rxresumeEmail?.message as string | undefined,
            password: rxresumePasswordValue,
            onPasswordChange: (value) =>
              setDirtyTouchedValue("rxresumePassword", value),
            passwordError: errors.rxresumePassword?.message as
              | string
              | undefined,
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
      </AccordionContent>
    </AccordionItem>
  );
};
