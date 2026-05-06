import { type ReactElement, useId } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TooltipWhenDisabledProps = {
  reason: string | null;
  children: ReactElement;
  className?: string;
};

export function TooltipWhenDisabled({
  reason,
  children,
  className,
}: TooltipWhenDisabledProps) {
  const descriptionId = useId();

  if (!reason) {
    return children;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* biome-ignore-start lint/a11y/noNoninteractiveTabindex: Disabled controls need a focusable wrapper so keyboard users can read the reason tooltip. */}
          <span
            aria-describedby={descriptionId}
            aria-disabled="true"
            className={cn("inline-flex cursor-not-allowed", className)}
            tabIndex={0}
          >
            <span id={descriptionId} className="sr-only">
              {reason}
            </span>
            {children}
          </span>
          {/* biome-ignore-end lint/a11y/noNoninteractiveTabindex: end focusable disabled-control wrapper suppression */}
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-center">
          <p>{reason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
