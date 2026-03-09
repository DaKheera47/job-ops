import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type { ResumeExportMode } from "@shared/types.js";
import type React from "react";
import { useFormContext, useWatch } from "react-hook-form";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type LatexValidationState = {
  checked: boolean;
  valid: boolean;
  message: string | null;
};

type ResumeExportSectionProps = {
  exportModeValue: ResumeExportMode;
  latexValidation: LatexValidationState;
  onValidateLatex: () => void;
  isLoading: boolean;
  isSaving: boolean;
};

export const ResumeExportSection: React.FC<ResumeExportSectionProps> = ({
  exportModeValue,
  latexValidation,
  onValidateLatex,
  isLoading,
  isSaving,
}) => {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  const selectedMode =
    (useWatch({ control, name: "resumeExportMode" }) as ResumeExportMode) ??
    exportModeValue;

  const disabled = isLoading || isSaving;
  const latexStatusLabel = !latexValidation.checked
    ? "Not tested"
    : latexValidation.valid
      ? "Valid"
      : "Invalid";
  const latexStatusColor = !latexValidation.checked
    ? "text-muted-foreground"
    : latexValidation.valid
      ? "text-emerald-600"
      : "text-destructive";

  return (
    <AccordionItem value="resume-export" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Resume Export</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="resumeExportMode" className="text-sm font-medium">
              Export mode
            </label>
            <Select
              value={selectedMode}
              onValueChange={(value) =>
                setValue(
                  "resumeExportMode",
                  value === "latex" ? "latex" : "rxresume",
                  {
                    shouldDirty: true,
                    shouldTouch: true,
                  },
                )
              }
              disabled={disabled}
            >
              <SelectTrigger id="resumeExportMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rxresume">RxResume</SelectItem>
                <SelectItem value="latex">LaTeX</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Exports tailored artifacts only. This workflow does not submit job
              applications automatically.
            </p>
          </div>

          {selectedMode === "latex" ? (
            <>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <SettingsInput
                  label="CV template path"
                  inputProps={{
                    ...register("latexCvTemplatePath"),
                    placeholder: "/absolute/path/to/cv-template.tex",
                  }}
                  disabled={disabled}
                  error={errors.latexCvTemplatePath?.message as string}
                  helper="Required when LaTeX mode is enabled."
                />
                <SettingsInput
                  label="Cover template path"
                  inputProps={{
                    ...register("latexCoverTemplatePath"),
                    placeholder: "/absolute/path/to/cover-template.tex",
                  }}
                  disabled={disabled}
                  error={errors.latexCoverTemplatePath?.message as string}
                  helper="Optional. Leave blank to generate CV only."
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onValidateLatex}
                  disabled={disabled}
                >
                  Validate LaTeX Paths
                </Button>
                <span className={`text-xs ${latexStatusColor}`}>
                  Status: {latexStatusLabel}
                </span>
                {latexValidation.message ? (
                  <span className="text-xs text-muted-foreground">
                    {latexValidation.message}
                  </span>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
