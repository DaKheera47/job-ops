import type React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TooltipWhenDisabledProps = {
  reason: string | null;
  children: React.ReactElement;
  className?: string;
};

export const TooltipWhenDisabled: React.FC<TooltipWhenDisabledProps> = ({
  reason,
  children,
  className,
}) => {
  if (!reason) {
    return children;
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex cursor-not-allowed", className)}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-center">
          <p>{reason}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
