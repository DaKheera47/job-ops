import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type { ModelValues } from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import type React from "react";
import { useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";

type ModelSettingsSectionProps = {
  values: ModelValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const ModelSettingsSection: React.FC<ModelSettingsSectionProps> = ({
  values,
  isLoading,
  isSaving,
}) => {
  const {
    effective,
    default: defaultModel,
    scorer,
    tailoring,
    projectSelection,
  } = values;
  const {
    register,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  return (
    <AccordionItem value="model" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Model</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <SettingsInput
            label="Override model"
            inputProps={register("model")}
            placeholder={defaultModel || "google/gemini-3-flash-preview"}
            disabled={isLoading || isSaving}
            error={errors.model?.message as string | undefined}
            helper="Leave blank to use the default from server env (`MODEL`)."
            current={effective || "—"}
          />

          <Separator />

          <div className="space-y-4">
            <div className="text-sm font-medium">Task-Specific Overrides</div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <SettingsInput
                label="Scoring Model"
                inputProps={register("modelScorer")}
                placeholder={effective || "inherit"}
                disabled={isLoading || isSaving}
                error={errors.modelScorer?.message as string | undefined}
                current={scorer || effective || "—"}
              />

              <SettingsInput
                label="Tailoring Model"
                inputProps={register("modelTailoring")}
                placeholder={effective || "inherit"}
                disabled={isLoading || isSaving}
                error={errors.modelTailoring?.message as string | undefined}
                current={tailoring || effective || "—"}
              />

              <SettingsInput
                label="Project Selection Model"
                inputProps={register("modelProjectSelection")}
                placeholder={effective || "inherit"}
                disabled={isLoading || isSaving}
                error={
                  errors.modelProjectSelection?.message as string | undefined
                }
                current={projectSelection || effective || "—"}
              />
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">
                Global Effective
              </div>
              <div className="break-words font-mono text-xs">
                {effective || "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default (env)</div>
              <div className="break-words font-mono text-xs">
                {defaultModel || "—"}
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
