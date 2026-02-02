import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type { ScoringValues } from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import { Calculator } from "lucide-react";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

type ScoringSettingsSectionProps = {
  values: ScoringValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const ScoringSettingsSection: React.FC<ScoringSettingsSectionProps> = ({
  values,
  isLoading,
  isSaving,
}) => {
  const { penalizeMissingSalary, missingSalaryPenalty } = values;
  const {
    control,
    watch,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  // Watch the current form value to conditionally enable/disable penalty input
  const currentPenalizeMissingSalary =
    watch("penalizeMissingSalary") ?? penalizeMissingSalary.default;

  return (
    <AccordionItem value="scoring" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <div className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          <span className="text-base font-semibold">Scoring Settings</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-6">
          {/* Enable salary penalty toggle */}
          <div className="flex items-start space-x-3">
            <Controller
              name="penalizeMissingSalary"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="penalizeMissingSalary"
                  checked={field.value ?? penalizeMissingSalary.default}
                  onCheckedChange={(checked) => {
                    field.onChange(
                      checked === "indeterminate" ? null : checked === true,
                    );
                  }}
                  disabled={isLoading || isSaving}
                />
              )}
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="penalizeMissingSalary"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                Penalize missing salary information
              </label>
              <p className="text-xs text-muted-foreground">
                Reduce the suitability score for jobs that don't include salary
                information. This helps prioritize transparent employers.
              </p>
            </div>
          </div>

          {/* Penalty amount - only shown when enabled */}
          {currentPenalizeMissingSalary && (
            <div className="pl-7">
              <Controller
                name="missingSalaryPenalty"
                control={control}
                render={({ field }) => (
                  <SettingsInput
                    label="Penalty Points"
                    type="number"
                    inputProps={{
                      ...field,
                      inputMode: "numeric",
                      min: 0,
                      max: 100,
                      placeholder: missingSalaryPenalty.default.toString(),
                      value: field.value ?? "",
                      onChange: (event) => {
                        const value = event.target.value.trim();
                        if (value === "") {
                          field.onChange(null);
                        } else {
                          const numValue = parseInt(value, 10);
                          field.onChange(
                            Number.isNaN(numValue) ? null : numValue,
                          );
                        }
                      },
                    }}
                    disabled={isLoading || isSaving}
                    error={
                      errors.missingSalaryPenalty?.message as string | undefined
                    }
                    helper={`Number of points to subtract from the suitability score (0-100) when salary information is missing. Default: ${missingSalaryPenalty.default}.`}
                    current={`Effective: ${missingSalaryPenalty.effective} | Default: ${missingSalaryPenalty.default}`}
                  />
                )}
              />
            </div>
          )}

          <Separator />

          {/* Effective/Default values display */}
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">
                Penalty Enabled
              </div>
              <div className="break-words font-mono text-xs">
                Effective: {penalizeMissingSalary.effective ? "Yes" : "No"} |
                Default: {penalizeMissingSalary.default ? "Yes" : "No"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Penalty Points
              </div>
              <div className="break-words font-mono text-xs">
                Effective: {missingSalaryPenalty.effective} | Default:{" "}
                {missingSalaryPenalty.default}
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
