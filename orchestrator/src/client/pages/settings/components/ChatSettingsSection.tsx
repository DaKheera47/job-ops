import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type { ChatValues } from "@client/pages/settings/types";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type ChatSettingsSectionProps = {
  values: ChatValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const ChatSettingsSection: React.FC<ChatSettingsSectionProps> = ({
  values,
  isLoading,
  isSaving,
}) => {
  const { tone, formality, constraints, doNotUse } = values;

  const { control, register } = useFormContext<UpdateSettingsInput>();

  return (
    <AccordionItem value="chat" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Ghostwriter</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="chatStyleTone" className="text-sm font-medium">
                Tone
              </label>
              <Controller
                name="chatStyleTone"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || tone.default}
                    onValueChange={(value) => field.onChange(value)}
                    disabled={isLoading || isSaving}
                  >
                    <SelectTrigger id="chatStyleTone">
                      <SelectValue placeholder="Select tone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="professional">Professional</SelectItem>
                      <SelectItem value="concise">Concise</SelectItem>
                      <SelectItem value="direct">Direct</SelectItem>
                      <SelectItem value="friendly">Friendly</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="chatStyleFormality"
                className="text-sm font-medium"
              >
                Formality
              </label>
              <Controller
                name="chatStyleFormality"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || formality.default}
                    onValueChange={(value) => field.onChange(value)}
                    disabled={isLoading || isSaving}
                  >
                    <SelectTrigger id="chatStyleFormality">
                      <SelectValue placeholder="Select formality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <SettingsInput
            label="Constraints"
            inputProps={register("chatStyleConstraints")}
            placeholder="Example: keep answers under 120 words and include bullet points"
            disabled={isLoading || isSaving}
            helper="Optional global writing constraints used by Ghostwriter replies."
            current={constraints.effective || "—"}
          />

          <SettingsInput
            label="Do-not-use terms"
            inputProps={register("chatStyleDoNotUse")}
            placeholder="Example: synergize, leverage"
            disabled={isLoading || isSaving}
            helper="Optional comma-separated words or phrases to avoid."
            current={doNotUse.effective || "—"}
          />

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Tone</div>
              <div className="break-words font-mono text-xs">
                Effective: {tone.effective} | Default: {tone.default}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Formality</div>
              <div className="break-words font-mono text-xs">
                Effective: {formality.effective} | Default: {formality.default}
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
