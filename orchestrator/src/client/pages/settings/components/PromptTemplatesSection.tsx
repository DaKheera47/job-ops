import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type { PromptTemplatesValues } from "@client/pages/settings/types";
import {
  PROMPT_TEMPLATE_DEFINITIONS,
  PROMPT_TEMPLATE_SETTING_KEYS,
  type PromptTemplateSettingKey,
} from "@shared/prompt-template-definitions.js";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import { AlertTriangle, RotateCcw } from "lucide-react";
import type React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type PromptTemplatesSectionProps = {
  values: PromptTemplatesValues;
  isLoading: boolean;
  isSaving: boolean;
  layoutMode?: "accordion" | "panel";
};

const TEMPLATE_FIELD_NAMES =
  PROMPT_TEMPLATE_SETTING_KEYS as PromptTemplateSettingKey[];

export const PromptTemplatesSection: React.FC<PromptTemplatesSectionProps> = ({
  values,
  isLoading,
  isSaving,
  layoutMode,
}) => {
  const { control, setValue } = useFormContext<UpdateSettingsInput>();

  const handleResetOne = (key: PromptTemplateSettingKey) => {
    setValue(key, values[key].default, { shouldDirty: true });
  };

  const handleResetAll = () => {
    for (const key of TEMPLATE_FIELD_NAMES) {
      setValue(key, values[key].default, { shouldDirty: true });
    }
  };

  return (
    <SettingsSectionFrame
      mode={layoutMode}
      title="Prompt Templates"
      value="prompt-templates"
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Edit the base AI instructions used by Ghostwriter, resume tailoring,
          and scoring.
        </p>

        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Advanced setting</AlertTitle>
          <AlertDescription>
            Changing these templates can degrade or break AI behavior. Removing
            important instructions or placeholders may produce poor results. Use
            reset to restore the default templates.
          </AlertDescription>
        </Alert>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleResetAll}
            disabled={isLoading || isSaving}
          >
            <RotateCcw className="h-4 w-4" />
            Reset all prompts
          </Button>
        </div>

        {TEMPLATE_FIELD_NAMES.map((key) => {
          const definition = PROMPT_TEMPLATE_DEFINITIONS[key];

          return (
            <div key={key} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <label htmlFor={key} className="text-sm font-medium">
                    {definition.label}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {definition.description}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleResetOne(key)}
                  disabled={isLoading || isSaving}
                >
                  Reset
                </Button>
              </div>

              <Controller
                name={key}
                control={control}
                render={({ field }) => (
                  <Textarea
                    {...field}
                    id={key}
                    value={field.value ?? values[key].effective}
                    onChange={(event) => field.onChange(event.target.value)}
                    disabled={isLoading || isSaving}
                    maxLength={12000}
                    className="min-h-[220px] font-mono text-xs"
                  />
                )}
              />

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">
                  Supported placeholders
                </div>
                <div className="flex flex-wrap gap-2">
                  {definition.placeholders.map((placeholder) => (
                    <span
                      key={placeholder}
                      className="rounded bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
                    >
                      {`{{${placeholder}}}`}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SettingsSectionFrame>
  );
};
