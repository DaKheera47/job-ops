import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type { ResumeProjectCatalogItem, RxResumeMode } from "@shared/types.js";
import type React from "react";
import { useFormContext } from "react-hook-form";
import { ReactiveResumeConfigPanel } from "@client/components/ReactiveResumeConfigPanel";
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
    v4: { checked: boolean; valid: boolean };
    v5: { checked: boolean; valid: boolean };
  };
  onValidateCurrentMode?: () => void | Promise<void>;
  isValidatingMode?: boolean;
  rxresumeApiKeyHint: string | null;
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
  onValidateCurrentMode,
  isValidatingMode = false,
  rxresumeApiKeyHint,
  profileProjects,
  lockedCount,
  maxProjectsTotal,
  isProjectsLoading,
  isLoading,
  isSaving,
}) => {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();
  const selectedMode = watch("rxresumeMode") ?? rxresumeMode ?? "v5";
  const rxresumeApiKeyValue = watch("rxresumeApiKey") ?? "";
  const rxresumeEmailValue = watch("rxresumeEmail") ?? "";
  const rxresumePasswordValue = watch("rxresumePassword") ?? "";
  const resumeProjectsValue = watch("resumeProjects");

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
            setValue("rxresumeMode", mode, {
              shouldDirty: true,
              shouldTouch: true,
            });
          }}
          disabled={isLoading || isSaving}
          showAccessAlert
          hasRxResumeAccess={hasRxResumeAccess}
          showValidationStatus={Boolean(validationStatuses)}
          validationStatuses={validationStatuses}
          validationAction={
            onValidateCurrentMode
              ? {
                  label: selectedMode === "v4" ? "Test v4" : "Test v5",
                  onClick: onValidateCurrentMode,
                  isLoading: isValidatingMode,
                }
              : undefined
          }
          v5={{
            apiKey: rxresumeApiKeyValue,
            onApiKeyChange: (value) =>
              setValue("rxresumeApiKey", value, {
                shouldDirty: true,
                shouldTouch: true,
              }),
            error: errors.rxresumeApiKey?.message as string | undefined,
            hint: rxresumeApiKeyHint,
          }}
          v4={{
            email: rxresumeEmailValue,
            onEmailChange: (value) =>
              setValue("rxresumeEmail", value, {
                shouldDirty: true,
                shouldTouch: true,
              }),
            emailError: errors.rxresumeEmail?.message as string | undefined,
            password: rxresumePasswordValue,
            onPasswordChange: (value) =>
              setValue("rxresumePassword", value, {
                shouldDirty: true,
                shouldTouch: true,
              }),
            passwordError: errors.rxresumePassword?.message as string | undefined,
          }}
          projectSelection={{
            baseResumeId: rxResumeBaseResumeIdDraft,
            onBaseResumeIdChange: setRxResumeBaseResumeIdDraft,
            projects: profileProjects,
            value: resumeProjectsValue,
            onChange: (next) =>
              setValue("resumeProjects", next, {
                shouldDirty: true,
                shouldTouch: true,
              }),
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
