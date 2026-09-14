import { Star } from "lucide-react";
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
import type { ScoreFilterMode } from "../constants";
import { FilterPill } from "./FilterPill";
import { scoreModeOptions } from "./filterOptions";
import type { ScoreFilterPillProps } from "./types";

const clampScore = (value: number): number => Math.min(100, Math.max(0, value));

export const ScoreFilterPill: React.FC<ScoreFilterPillProps> = ({
  scoreFilter,
  onScoreFilterChange,
  scoreActive,
  scoreSummary,
}) => (
  <FilterPill
    icon={<Star />}
    label="Score"
    active={scoreActive}
    summary={scoreSummary}
  >
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>Score</span>
        <Select
          value={scoreFilter.mode}
          onValueChange={(value) => {
            const nextMode = value as ScoreFilterMode;
            onScoreFilterChange({
              mode: nextMode,
              min: nextMode === "has" ? scoreFilter.min : null,
              max: nextMode === "has" ? scoreFilter.max : null,
            });
          }}
        >
          <SelectTrigger
            id="score-mode"
            aria-label="Score filter mode"
            className="h-8 w-[150px] text-foreground"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {scoreModeOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {scoreFilter.mode === "has" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="score-min-filter">Minimum</Label>
            <Input
              id="score-min-filter"
              value={scoreFilter.min == null ? "" : String(scoreFilter.min)}
              onChange={(event) => {
                const raw = event.target.value.trim();
                const parsed = Number.parseInt(raw, 10);
                onScoreFilterChange({
                  ...scoreFilter,
                  min: Number.isFinite(parsed) ? clampScore(parsed) : null,
                });
              }}
              inputMode="numeric"
              min={0}
              max={100}
              placeholder="e.g. 60"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="score-max-filter">Maximum</Label>
            <Input
              id="score-max-filter"
              value={scoreFilter.max == null ? "" : String(scoreFilter.max)}
              onChange={(event) => {
                const raw = event.target.value.trim();
                const parsed = Number.parseInt(raw, 10);
                onScoreFilterChange({
                  ...scoreFilter,
                  max: Number.isFinite(parsed) ? clampScore(parsed) : null,
                });
              }}
              inputMode="numeric"
              min={0}
              max={100}
              placeholder="e.g. 90"
            />
          </div>
        </div>
      )}
    </div>
  </FilterPill>
);
