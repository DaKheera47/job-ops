import type { JobStatus } from "@shared/types.js";
import { cn } from "@/lib/utils";
import { defaultStatusToken, statusTokens } from "./constants";

interface JobStatusBadgeProps {
  status: JobStatus;
  label?: string;
  className?: string;
}

export const JobStatusBadge = ({
  status,
  label,
  className,
}: JobStatusBadgeProps) => {
  const statusToken = statusTokens[status] ?? defaultStatusToken;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
        statusToken.badge,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", statusToken.dot)} />
      {label ?? statusToken.label}
    </span>
  );
};
