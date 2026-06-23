import { CalendarDays } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  dateFilterDimensionLabels,
  dateFilterDimensionOrder,
} from "../constants";
import { FilterPill } from "./FilterPill";
import { datePresetOptions } from "./filterOptions";
import { getDateRangeForPreset, toggleDimension } from "./filterUtils";
import type { DateFilterPillProps } from "./types";

export const DateFilterPill: React.FC<DateFilterPillProps> = ({
  dateFilter,
  onDateFilterChange,
}) => {
  const clearDateFilter = () =>
    onDateFilterChange({
      dimensions: [],
      startDate: null,
      endDate: null,
      preset: null,
    });

  return (
    <FilterPill
      icon={<CalendarDays />}
      label="Dates"
      active={dateFilter.dimensions.length > 0}
      badge={dateFilter.dimensions.length}
      contentClassName="w-80"
    >
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {dateFilterDimensionOrder.map((dimension) => (
            <Button
              key={dimension}
              type="button"
              size="sm"
              variant={
                dateFilter.dimensions.includes(dimension)
                  ? "default"
                  : "outline"
              }
              onClick={() =>
                onDateFilterChange(toggleDimension(dateFilter, dimension))
              }
            >
              {dateFilterDimensionLabels[dimension]}
            </Button>
          ))}
        </div>

        {dateFilter.dimensions.length > 0 && (
          <>
            <div className="flex flex-wrap gap-2">
              {datePresetOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={
                    dateFilter.preset === option.value ? "default" : "outline"
                  }
                  onClick={() =>
                    onDateFilterChange({
                      ...dateFilter,
                      preset: option.value,
                      ...getDateRangeForPreset(option.value),
                    })
                  }
                >
                  Last {option.label}
                </Button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="date-start-filter">Start date</Label>
                <Input
                  id="date-start-filter"
                  type="date"
                  value={dateFilter.startDate ?? ""}
                  onChange={(event) =>
                    onDateFilterChange({
                      ...dateFilter,
                      startDate: event.target.value || null,
                      preset: "custom",
                    })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="date-end-filter">End date</Label>
                <Input
                  id="date-end-filter"
                  type="date"
                  value={dateFilter.endDate ?? ""}
                  onChange={(event) =>
                    onDateFilterChange({
                      ...dateFilter,
                      endDate: event.target.value || null,
                      preset: "custom",
                    })
                  }
                />
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={clearDateFilter}
            >
              Clear date filters
            </Button>
          </>
        )}
      </div>
    </FilterPill>
  );
};
