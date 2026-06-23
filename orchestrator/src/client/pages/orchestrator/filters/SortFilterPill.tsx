import { ArrowDownUp } from "lucide-react";
import type React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { bucketCount, trackProductEvent } from "@/lib/analytics";
import type { JobSort } from "../constants";
import { defaultSortDirection, sortLabels } from "../constants";
import { FilterPill } from "./FilterPill";
import { sortFieldOrder } from "./filterOptions";
import { getDirectionOptions } from "./filterUtils";
import type { SortFilterPillProps } from "./types";

export const SortFilterPill: React.FC<SortFilterPillProps> = ({
  activeTab,
  sort,
  onSortChange,
  filteredCount,
  sortDirectionLabel,
}) => {
  const applySortChange = (nextSort: JobSort) => {
    if (nextSort.key === sort.key && nextSort.direction === sort.direction) {
      return;
    }

    trackProductEvent("jobs_sort_changed", {
      sort_key: nextSort.key,
      sort_direction: nextSort.direction,
      previous_sort_key: sort.key,
      previous_sort_direction: sort.direction,
      tab: activeTab,
      filtered_count_bucket: bucketCount(filteredCount),
    });
    onSortChange(nextSort);
  };

  return (
    <FilterPill
      icon={<ArrowDownUp />}
      label="Sort"
      active={false}
      summary={`${sortLabels[sort.key]}${
        sortDirectionLabel ? ` · ${sortDirectionLabel}` : ""
      }`}
      contentClassName="w-64"
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <div className="space-y-1">
          <span>Sort by</span>
          <Select
            value={sort.key}
            onValueChange={(value) =>
              applySortChange({
                key: value as JobSort["key"],
                direction: defaultSortDirection[value as JobSort["key"]],
              })
            }
          >
            <SelectTrigger
              id="sort-key"
              aria-label="Sort field"
              className="h-8 w-full text-foreground"
            >
              <SelectValue placeholder={sortLabels[sort.key]} />
            </SelectTrigger>
            <SelectContent>
              {sortFieldOrder.map((key) => (
                <SelectItem key={key} value={key}>
                  {sortLabels[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span>Direction</span>
          <Select
            value={sort.direction}
            onValueChange={(value) =>
              applySortChange({
                ...sort,
                direction: value as JobSort["direction"],
              })
            }
          >
            <SelectTrigger
              id="sort-direction"
              aria-label="Sort order"
              className="h-8 w-full text-foreground"
            >
              <SelectValue placeholder={sortDirectionLabel} />
            </SelectTrigger>
            <SelectContent>
              {getDirectionOptions(sort.key).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </FilterPill>
  );
};
