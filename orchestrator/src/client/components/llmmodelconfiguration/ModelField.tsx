import type { ReactNode } from "react";
import { SettingsInput } from "@/client/pages/settings/components/SettingsInput";
import { SearchableDropdown } from "@/components/ui/searchable-dropdown";

function ModelField({
  id,
  label,
  value,
  onChange,
  error,
  supportsModelSuggestions,
  options,
  placeholder,
  helper,
  current,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  supportsModelSuggestions: boolean;
  options: Array<{ value: string; label: string; searchText: string }>;
  placeholder: string;
  helper?: ReactNode;
  current: string;
  disabled: boolean;
}) {
  if (supportsModelSuggestions) {
    return (
      <div className="space-y-2">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <SearchableDropdown
          inputId={id}
          value={value}
          options={options}
          onValueChange={onChange}
          placeholder={placeholder}
          searchPlaceholder="Search models..."
          emptyText="No models found."
          ariaLabel={label}
          disabled={disabled}
          triggerClassName="h-9 w-full justify-between rounded-md border border-input bg-transparent px-3 text-sm font-normal shadow-sm"
          contentClassName="w-[var(--radix-popover-trigger-width)] border-border bg-popover p-0"
          listClassName="max-h-64"
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        {helper ? (
          <div className="text-xs text-muted-foreground">{helper}</div>
        ) : null}
        <div className="text-xs text-muted-foreground">
          Current: <span className="font-mono">{current}</span>
        </div>
      </div>
    );
  }

  return (
    <SettingsInput
      label={label}
      inputProps={{
        name: id,
        value,
        onChange: (event) => onChange(event.target.value),
      }}
      placeholder={placeholder}
      disabled={disabled}
      error={error}
      helper={helper}
      current={current}
    />
  );
}

export default ModelField;
