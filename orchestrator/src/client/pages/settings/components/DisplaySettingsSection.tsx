import type { DisplayValues } from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

type DisplaySettingsSectionProps = {
  values: DisplayValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const DisplaySettingsSection: React.FC<DisplaySettingsSectionProps> = ({
  values,
  isLoading,
  isSaving,
}) => {
  const {
    default: defaultShowSponsorInfo,
    effective: effectiveShowSponsorInfo,
  } = values;
  const { control } = useFormContext<UpdateSettingsInput>();

  return (
    <AccordionItem value="display" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Display Settings</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Controller
              name="showSponsorInfo"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="showSponsorInfo"
                  checked={field.value ?? defaultShowSponsorInfo}
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
                htmlFor="showSponsorInfo"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                Show visa sponsor information
              </label>
              <p className="text-xs text-muted-foreground">
                Display a badge next to the employer name showing the match
                percentage with the UK visa sponsor list. This helps identify
                employers that are licensed to sponsor work visas.
              </p>
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Effective</div>
              <div className="break-words font-mono text-xs">
                {effectiveShowSponsorInfo ? "Enabled" : "Disabled"}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default</div>
              <div className="break-words font-mono text-xs font-semibold">
                {defaultShowSponsorInfo ? "Enabled" : "Disabled"}
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
