import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type { TypstStyleValues } from "@client/pages/settings/types";
import { HEX_COLOR_REGEX } from "@shared/settings-registry.js";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type React from "react";
import { useRef } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Input } from "@/components/ui/input";
import {
  SearchableDropdown,
  type SearchableDropdownOption,
} from "@/components/ui/searchable-dropdown";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type TypstStyleSettingsSectionProps = {
  values: TypstStyleValues;
  isLoading: boolean;
  isSaving: boolean;
  layoutMode?: "accordion" | "panel";
};

function isValidHex(value: string): boolean {
  return HEX_COLOR_REGEX.test(value);
}

const FONT_FAMILY_OPTIONS: SearchableDropdownOption[] = [
  { value: "", label: "Use resume default" },
  { value: "System UI", label: "System UI" },
  { value: "Segoe UI", label: "Segoe UI" },
  { value: "San Francisco", label: "San Francisco" },
  { value: "Roboto", label: "Roboto" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Arial", label: "Arial" },
  { value: "Verdana", label: "Verdana" },
  { value: "Tahoma", label: "Tahoma" },
  { value: "Trebuchet MS", label: "Trebuchet MS" },
  { value: "Times New Roman", label: "Times New Roman" },
  { value: "Georgia", label: "Georgia" },
  { value: "Garamond", label: "Garamond" },
  { value: "Palatino", label: "Palatino" },
  { value: "Noto Sans", label: "Noto Sans" },
  { value: "Noto Serif", label: "Noto Serif" },
  { value: "IBM Plex Sans", label: "IBM Plex Sans" },
  { value: "IBM Plex Serif", label: "IBM Plex Serif" },
  { value: "IBM Plex Mono", label: "IBM Plex Mono" },
  { value: "Courier New", label: "Courier New" },
  { value: "Consolas", label: "Consolas" },
  { value: "Monaco", label: "Monaco" },
  { value: "Menlo", label: "Menlo" },
];
const FONT_PREVIEW_TEXT = "The quick brown fox jumps over the lazy dog.";

type ColorFieldProps = {
  id: keyof UpdateSettingsInput;
  label: string;
  description: string;
  placeholder: string;
  isDisabled: boolean;
  effective: string;
  defaultValue: string;
};

type FontFieldProps = {
  id: keyof UpdateSettingsInput;
  label: string;
  description: string;
  placeholder: string;
  isDisabled: boolean;
  effective: string;
  defaultValue: string;
};

const FontField: React.FC<FontFieldProps> = ({
  id,
  label,
  description,
  placeholder,
  isDisabled,
  effective,
  defaultValue,
}) => {
  const { control } = useFormContext<UpdateSettingsInput>();
  const selectedFontValue = useWatch({ control, name: id });
  const previewFont =
    (typeof selectedFontValue === "string" ? selectedFontValue : "").trim() ||
    effective ||
    defaultValue;

  // Format font family for CSS - wrap in quotes if it contains spaces and add fallbacks
  const previewFontFamily = previewFont
    ? `"${previewFont}", system-ui, -apple-system, sans-serif`
    : undefined;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <Controller
        name={id}
        control={control}
        render={({ field, fieldState }) => (
          <>
            <SearchableDropdown
              inputId={id}
              value={(field.value as string | null | undefined) ?? ""}
              options={FONT_FAMILY_OPTIONS}
              onValueChange={(nextValue) => field.onChange(nextValue)}
              placeholder={placeholder}
              searchPlaceholder="Search fonts..."
              emptyText="No matching fonts."
              allowCustomValue
              disabled={isDisabled}
              triggerClassName={cn(
                "h-10 w-full",
                fieldState.error && "border-destructive",
              )}
              ariaLabel={field.value ? String(field.value) : placeholder}
            />
            {fieldState.error && (
              <p className="mt-2 text-xs text-destructive">
                {fieldState.error.message}
              </p>
            )}
          </>
        )}
      />
      <div className="text-xs text-muted-foreground">
        Type any font name to add a custom value.
      </div>
      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <div className="text-muted-foreground">Effective</div>
          <div className="font-mono">{effective || "(from resume)"}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Default</div>
          <div className="font-mono font-semibold">
            {defaultValue || "(from resume)"}
          </div>
        </div>
      </div>
      {previewFontFamily && (
        <div
          className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-foreground"
          style={{ fontFamily: previewFontFamily }}
        >
          {FONT_PREVIEW_TEXT}
        </div>
      )}
    </div>
  );
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
                {fieldState.error && (
                  <p className="mt-2 text-xs text-destructive">
                    {fieldState.error.message}
                  </p>
                )}
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

          <FontField
            id="typstBodyFont"
            label="Body font family"
            description='Font used for body text, contact lines, and skill tags. Defaults to the resume typography setting or "IBM Plex Serif".'
            placeholder={
              values.bodyFont.effective || "IBM Plex Serif (default)"
            }
            isDisabled={isDisabled}
            effective={values.bodyFont.effective}
            defaultValue={values.bodyFont.default}
          />

          <Separator />

          <FontField
            id="typstHeadingFont"
            label="Heading font family"
            description="Font used for section headings and the name. Defaults to the body font when not set."
            placeholder={
              values.headingFont.effective || "IBM Plex Serif (default)"
            }
            isDisabled={isDisabled}
            effective={values.headingFont.effective}
            defaultValue={values.headingFont.default}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">Colors</h3>
          <p className="text-xs text-muted-foreground">
            Enter a 6-digit hex color (e.g. #dc2626) or click the swatch to use
            a color picker. Primary background fills the page; secondary
            background is used for sidebars and other secondary surfaces. Leave
            blank to inherit from the resume design.
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
            label="Primary background color"
            description="Main page background color."
            placeholder="#ffffff"
            isDisabled={isDisabled}
            effective={values.backgroundColor.effective}
            defaultValue={values.backgroundColor.default}
          />

          <Separator />

          <ColorField
            id="typstSecondaryBackgroundColor"
            label="Secondary background color"
            description="Used for secondary surfaces like sidebars and section blocks."
            placeholder="#f6f6f6"
            isDisabled={isDisabled}
            effective={values.secondaryBackgroundColor.effective}
            defaultValue={values.secondaryBackgroundColor.default}
          />
        </div>
      </div>
    </SettingsSectionFrame>
  );
};
