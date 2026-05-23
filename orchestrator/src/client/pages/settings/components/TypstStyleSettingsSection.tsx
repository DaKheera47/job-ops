import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type { TypstStyleValues } from "@client/pages/settings/types";
import { HEX_COLOR_REGEX } from "@shared/settings-registry.js";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type React from "react";
import { useRef } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

type TypstStyleSettingsSectionProps = {
  values: TypstStyleValues;
  isLoading: boolean;
  isSaving: boolean;
  layoutMode?: "accordion" | "panel";
};

function isValidHex(value: string): boolean {
  return HEX_COLOR_REGEX.test(value);
}

type ColorFieldProps = {
  id: keyof UpdateSettingsInput;
  label: string;
  description: string;
  placeholder: string;
  isDisabled: boolean;
  effective: string;
  defaultValue: string;
};

const ColorField: React.FC<ColorFieldProps> = ({
  id,
  label,
  description,
  placeholder,
  isDisabled,
  effective,
  defaultValue,
}) => {
  const { control } = useFormContext<UpdateSettingsInput>();
  const colorInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <Controller
        name={id}
        control={control}
        render={({ field, fieldState }) => {
          const textValue = (field.value as string | null | undefined) ?? "";
          const swatchColor = isValidHex(textValue)
            ? textValue
            : isValidHex(effective)
              ? effective
              : "#ffffff";

          return (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="h-9 w-9 shrink-0 rounded-md border border-input shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: swatchColor }}
                disabled={isDisabled}
                aria-label={`Pick ${label}`}
                onClick={() => colorInputRef.current?.click()}
              />
              <input
                ref={colorInputRef}
                type="color"
                value={isValidHex(textValue) ? textValue : swatchColor}
                className="sr-only"
                disabled={isDisabled}
                onChange={(e) => {
                  field.onChange(e.target.value);
                }}
              />
              <div className="flex-1">
                <Input
                  id={id}
                  value={textValue}
                  placeholder={placeholder}
                  disabled={isDisabled}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                  className={
                    fieldState.error ? "border-destructive" : undefined
                  }
                />
              </div>
            </div>
          );
        }}
      />
      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <div className="text-muted-foreground">Effective</div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm border"
              style={{
                backgroundColor: isValidHex(effective) ? effective : undefined,
              }}
            />
            <span className="font-mono">{effective || "(from resume)"}</span>
          </div>
        </div>
        <div>
          <div className="text-muted-foreground">Default</div>
          <div className="font-mono font-semibold">
            {defaultValue || "(from resume)"}
          </div>
        </div>
      </div>
    </div>
  );
};

export const TypstStyleSettingsSection: React.FC<
  TypstStyleSettingsSectionProps
> = ({ values, isLoading, isSaving, layoutMode }) => {
  const { control, formState } = useFormContext<UpdateSettingsInput>();
  const isDisabled = isLoading || isSaving;

  return (
    <SettingsSectionFrame
      mode={layoutMode}
      title="Typst Theme Style"
      value="typst-style"
    >
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Override the fonts and colors used when rendering PDFs with a Typst
          theme. Leave a field blank to inherit the value from the resume design
          (metadata.typography / metadata.design.colors).
        </p>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Typography</h3>

          <div className="space-y-2">
            <label htmlFor="typstBodyFont" className="text-sm font-medium">
              Body font family
            </label>
            <p className="text-xs text-muted-foreground">
              Font used for body text, contact lines, and skill tags. Defaults
              to the resume typography setting or "IBM Plex Serif".
            </p>
            <Controller
              name="typstBodyFont"
              control={control}
              render={({ field, fieldState }) => (
                <Input
                  id="typstBodyFont"
                  value={(field.value as string | null | undefined) ?? ""}
                  placeholder={
                    values.bodyFont.effective || "IBM Plex Serif (default)"
                  }
                  disabled={isDisabled}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                  className={
                    fieldState.error ? "border-destructive" : undefined
                  }
                />
              )}
            />
            {formState.errors.typstBodyFont && (
              <p className="text-xs text-destructive">
                {formState.errors.typstBodyFont.message as string}
              </p>
            )}
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <div className="text-muted-foreground">Effective</div>
                <div className="font-mono">
                  {values.bodyFont.effective || "(from resume)"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Default</div>
                <div className="font-mono font-semibold">
                  {values.bodyFont.default || "(from resume)"}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <label htmlFor="typstHeadingFont" className="text-sm font-medium">
              Heading font family
            </label>
            <p className="text-xs text-muted-foreground">
              Font used for section headings and the name. Defaults to the body
              font when not set.
            </p>
            <Controller
              name="typstHeadingFont"
              control={control}
              render={({ field, fieldState }) => (
                <Input
                  id="typstHeadingFont"
                  value={(field.value as string | null | undefined) ?? ""}
                  placeholder={
                    values.headingFont.effective || "IBM Plex Serif (default)"
                  }
                  disabled={isDisabled}
                  onChange={(e) => field.onChange(e.target.value)}
                  onBlur={field.onBlur}
                  className={
                    fieldState.error ? "border-destructive" : undefined
                  }
                />
              )}
            />
            {formState.errors.typstHeadingFont && (
              <p className="text-xs text-destructive">
                {formState.errors.typstHeadingFont.message as string}
              </p>
            )}
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <div className="text-muted-foreground">Effective</div>
                <div className="font-mono">
                  {values.headingFont.effective || "(from resume)"}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Default</div>
                <div className="font-mono font-semibold">
                  {values.headingFont.default || "(from resume)"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Colors</h3>
          <p className="text-xs text-muted-foreground">
            Enter a 6-digit hex color (e.g. #dc2626) or click the swatch to use
            a color picker. Leave blank to inherit from the resume design.
          </p>

          <ColorField
            id="typstPrimaryColor"
            label="Primary (accent) color"
            description="Used for section headings, name highlight, and accent elements."
            placeholder="#dc2626"
            isDisabled={isDisabled}
            effective={values.primaryColor.effective}
            defaultValue={values.primaryColor.default}
          />

          <Separator />

          <ColorField
            id="typstTextColor"
            label="Text color"
            description="Main body and paragraph text color."
            placeholder="#000000"
            isDisabled={isDisabled}
            effective={values.textColor.effective}
            defaultValue={values.textColor.default}
          />

          <Separator />

          <ColorField
            id="typstBackgroundColor"
            label="Background color"
            description="Page background color."
            placeholder="#ffffff"
            isDisabled={isDisabled}
            effective={values.backgroundColor.effective}
            defaultValue={values.backgroundColor.default}
          />
        </div>
      </div>
    </SettingsSectionFrame>
  );
};
