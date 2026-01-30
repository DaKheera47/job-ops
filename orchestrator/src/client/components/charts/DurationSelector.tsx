/**
 * DurationSelector - Sticky nav component for selecting time range
 * Controls the duration for all charts on the home page
 */

import { useCallback } from "react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DURATION_OPTIONS = [
  { value: 7, label: "7d" },
  { value: 14, label: "14d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
] as const;

export type DurationValue = (typeof DURATION_OPTIONS)[number]["value"];

interface DurationSelectorProps {
  value: DurationValue;
  onChange: (value: DurationValue) => void;
}

export function DurationSelector({ value, onChange }: DurationSelectorProps) {
  const handleChange = useCallback(
    (newValue: string) => {
      const parsed = Number(newValue) as DurationValue;
      onChange(parsed);
    },
    [onChange],
  );

  return (
    <div className="flex items-center gap-2">
      <Tabs value={String(value)} onValueChange={handleChange}>
        <TabsList className="h-8">
          {DURATION_OPTIONS.map((option) => (
            <TabsTrigger
              key={option.value}
              value={String(option.value)}
              className="px-3 text-xs"
            >
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  );
}
