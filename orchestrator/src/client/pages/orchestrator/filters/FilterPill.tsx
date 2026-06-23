import { ChevronDown } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Trigger button shared by every filter dropdown ("faceted filter" style). */
export interface FilterPillProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  /** Short value shown inline on the trigger when the filter is active. */
  summary?: string | null;
  /** Numeric badge shown when several values are selected. */
  badge?: number;
  contentClassName?: string;
  children: React.ReactNode;
}

export const FilterPill: React.FC<FilterPillProps> = ({
  icon,
  label,
  active,
  summary,
  badge,
  contentClassName,
  children,
}) => (
  <Popover>
    <PopoverTrigger asChild>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          "h-9 gap-1.5 rounded-full border-solid text-xs font-medium text-muted-foreground",
          active && "border-primary/50 bg-primary/5 text-foreground",
        )}
      >
        <span className="[&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:opacity-70">
          {icon}
        </span>
        <span>{label}</span>
        {summary ? (
          <span className="max-w-[10rem] truncate font-semibold text-foreground">
            {summary}
          </span>
        ) : null}
        {typeof badge === "number" && badge > 0 ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/20 px-1 text-[10px] font-semibold tabular-nums text-primary">
            {badge}
          </span>
        ) : null}
        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className={cn("w-64", contentClassName)}>
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {children}
      </div>
    </PopoverContent>
  </Popover>
);
