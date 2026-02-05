import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type { NumericSettingValues } from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type NumericFieldName =
  | "ukvisajobsMaxJobs"
  | "gradcrackerMaxJobsPerTerm"
  | "jobspyResultsWanted"
  | "jobspyHoursOld"
  | "backupHour"
  | "backupMaxCount";

type NumericSettingSectionProps = {
  accordionValue: string;
  title: string;
  fieldName: NumericFieldName;
  label: string;
  helper: string;
  values: NumericSettingValues;
  min: number;
  max: number;
  isLoading: boolean;
  isSaving: boolean;
};

export const NumericSettingSection: React.FC<NumericSettingSectionProps> = ({
  accordionValue,
  title,
  fieldName,
  label,
  helper,
  values,
  min,
  max,
  isLoading,
  isSaving,
}) => {
  const { effective, default: defaultValue } = values;
  const {
    control,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  return (
    <AccordionItem value={accordionValue} className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">{title}</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <Controller
            name={fieldName}
            control={control}
            render={({ field }) => (
              <SettingsInput
                label={label}
                type="number"
                inputProps={{
                  ...field,
                  inputMode: "numeric",
                  min,
                  max,
                  value: field.value ?? defaultValue,
                  onChange: (event) => {
                    const parsed = parseInt(event.target.value, 10);
                    if (Number.isNaN(parsed)) {
                      field.onChange(null);
                      return;
                    }
                    field.onChange(Math.min(max, Math.max(min, parsed)));
                  },
                }}
                disabled={isLoading || isSaving}
                error={errors[fieldName]?.message as string | undefined}
                helper={helper}
                current={String(effective)}
              />
            )}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
