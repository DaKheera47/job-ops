import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type {
  DisplayValues,
  NumericSettingValues,
} from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";

type GradcrackerSectionProps = {
  values: NumericSettingValues;
  enabled: DisplayValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const GradcrackerSection: React.FC<GradcrackerSectionProps> = ({
  values,
  enabled,
  isLoading,
  isSaving,
}) => {
  const {
    effective: effectiveGradcrackerMaxJobsPerTerm,
    default: defaultGradcrackerMaxJobsPerTerm,
  } = values;
  const {
    effective: effectiveGradcrackerEnabled,
    default: defaultGradcrackerEnabled,
  } = enabled;
  const {
    control,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  return (
    <AccordionItem value="gradcracker" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Gradcracker Extractor</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Controller
                name="gradcrackerEnabled"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="gradcracker-enabled"
                    checked={field.value ?? defaultGradcrackerEnabled}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                    }}
                    disabled={isLoading || isSaving}
                  />
                )}
              />
              <label
                htmlFor="gradcracker-enabled"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Enable Gradcracker scanner
              </label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              When disabled, Gradcracker will not run in the pipeline. Current:{" "}
              {effectiveGradcrackerEnabled ? "enabled" : "disabled"} (Default:{" "}
              {defaultGradcrackerEnabled ? "enabled" : "disabled"})
            </p>
          </div>
          <Controller
            name="gradcrackerMaxJobsPerTerm"
            control={control}
            render={({ field }) => (
              <SettingsInput
                label="Max jobs per search term"
                type="number"
                inputProps={{
                  ...field,
                  inputMode: "numeric",
                  min: 1,
                  max: 1000,
                  value: field.value ?? defaultGradcrackerMaxJobsPerTerm,
                  onChange: (event) => {
                    const value = parseInt(event.target.value, 10);
                    if (Number.isNaN(value)) {
                      field.onChange(null);
                    } else {
                      field.onChange(Math.min(1000, Math.max(1, value)));
                    }
                  },
                }}
                disabled={isLoading || isSaving}
                error={
                  errors.gradcrackerMaxJobsPerTerm?.message as
                    | string
                    | undefined
                }
                helper={`Maximum number of jobs to fetch for EACH search term from Gradcracker. Default: ${defaultGradcrackerMaxJobsPerTerm}. Range: 1-1000.`}
                current={String(effectiveGradcrackerMaxJobsPerTerm)}
              />
            )}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
