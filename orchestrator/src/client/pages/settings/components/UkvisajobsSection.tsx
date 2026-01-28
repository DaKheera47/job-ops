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

type UkvisajobsSectionProps = {
  values: NumericSettingValues;
  enabled: DisplayValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const UkvisajobsSection: React.FC<UkvisajobsSectionProps> = ({
  values,
  enabled,
  isLoading,
  isSaving,
}) => {
  const {
    effective: effectiveUkvisajobsMaxJobs,
    default: defaultUkvisajobsMaxJobs,
  } = values;
  const {
    effective: effectiveUkvisajobsEnabled,
    default: defaultUkvisajobsEnabled,
  } = enabled;
  const {
    control,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  return (
    <AccordionItem value="ukvisajobs" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">UKVisaJobs Extractor</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Controller
                name="ukvisajobsEnabled"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="ukvisajobs-enabled"
                    checked={field.value ?? defaultUkvisajobsEnabled}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                    }}
                    disabled={isLoading || isSaving}
                  />
                )}
              />
              <label
                htmlFor="ukvisajobs-enabled"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Enable UKVisaJobs scanner
              </label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              When disabled, UKVisaJobs will not run in the pipeline. Current:{" "}
              {effectiveUkvisajobsEnabled ? "enabled" : "disabled"} (Default:{" "}
              {defaultUkvisajobsEnabled ? "enabled" : "disabled"})
            </p>
          </div>
          <Controller
            name="ukvisajobsMaxJobs"
            control={control}
            render={({ field }) => (
              <SettingsInput
                label="Max jobs to fetch"
                type="number"
                inputProps={{
                  ...field,
                  inputMode: "numeric",
                  min: 1,
                  max: 1000,
                  value: field.value ?? defaultUkvisajobsMaxJobs,
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
                error={errors.ukvisajobsMaxJobs?.message as string | undefined}
                helper={`Maximum number of jobs to fetch from UKVisaJobs per pipeline run. Default: ${defaultUkvisajobsMaxJobs}. Range: 1-1000.`}
                current={String(effectiveUkvisajobsMaxJobs)}
              />
            )}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
