import { Banknote } from "lucide-react";
import type React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SalaryFilterMode } from "../constants";
import { FilterPill } from "./FilterPill";
import { salaryModeOptions } from "./filterOptions";
import type { SalaryFilterPillProps } from "./types";

export const SalaryFilterPill: React.FC<SalaryFilterPillProps> = ({
  salaryFilter,
  onSalaryFilterChange,
  salaryActive,
  salarySummary,
}) => {
  const showSalaryMin =
    salaryFilter.mode === "at_least" || salaryFilter.mode === "between";
  const showSalaryMax =
    salaryFilter.mode === "at_most" || salaryFilter.mode === "between";

  return (
    <FilterPill
      icon={<Banknote />}
      label="Salary"
      active={salaryActive}
      summary={salarySummary}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Salary is</span>
          <Select
            value={salaryFilter.mode}
            onValueChange={(value) => {
              const nextMode = value as SalaryFilterMode;
              if (nextMode === "at_least") {
                onSalaryFilterChange({
                  mode: nextMode,
                  min: salaryFilter.min,
                  max: null,
                });
                return;
              }
              if (nextMode === "at_most") {
                onSalaryFilterChange({
                  mode: nextMode,
                  min: null,
                  max: salaryFilter.max,
                });
                return;
              }
              onSalaryFilterChange({
                mode: nextMode,
                min: salaryFilter.min,
                max: salaryFilter.max,
              });
            }}
          >
            <SelectTrigger
              id="salary-mode"
              aria-label="Salary range specifier"
              className="h-8 w-[140px] text-foreground"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {salaryModeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {showSalaryMin && (
            <div className="space-y-1">
              <Label htmlFor="salary-min-filter">Minimum</Label>
              <Input
                id="salary-min-filter"
                value={salaryFilter.min == null ? "" : String(salaryFilter.min)}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  const parsed = Number.parseInt(raw, 10);
                  onSalaryFilterChange({
                    ...salaryFilter,
                    min: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
                  });
                }}
                inputMode="numeric"
                placeholder="e.g. 60000"
              />
            </div>
          )}

          {showSalaryMax && (
            <div className="space-y-1">
              <Label htmlFor="salary-max-filter">Maximum</Label>
              <Input
                id="salary-max-filter"
                value={salaryFilter.max == null ? "" : String(salaryFilter.max)}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  const parsed = Number.parseInt(raw, 10);
                  onSalaryFilterChange({
                    ...salaryFilter,
                    max: Number.isFinite(parsed) && parsed > 0 ? parsed : null,
                  });
                }}
                inputMode="numeric"
                placeholder="e.g. 100000"
              />
            </div>
          )}
        </div>
      </div>
    </FilterPill>
  );
};
