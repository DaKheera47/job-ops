import type React from "react";

import { Input } from "@/components/ui/input";

type SettingsInputProps = {
  label: string;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
  placeholder?: string;
  type?: React.HTMLInputTypeAttribute;
  disabled?: boolean;
  error?: string;
  helper?: string;
  current?: string | null;
};

export const SettingsInput: React.FC<SettingsInputProps> = ({
  label,
  inputProps,
  placeholder,
  type = "text",
  disabled,
  error,
  helper,
  current,
}) => {
  const id = inputProps.id || inputProps.name;

  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      <Input
        {...inputProps}
        id={id}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {helper && <div className="text-xs text-muted-foreground">{helper}</div>}
      {current !== undefined && (
        <div className="text-xs text-muted-foreground">
          Current: <span className="font-mono">{current}</span>
        </div>
      )}
    </div>
  );
};
