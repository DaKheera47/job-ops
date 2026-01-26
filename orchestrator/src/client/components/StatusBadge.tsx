/**
 * Status badge component.
 */

import { Loader2 } from "lucide-react";
import type React from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobStatus } from "../../shared/types";

interface StatusBadgeProps {
  status: JobStatus;
}

const statusLabels: Record<JobStatus, string> = {
  discovered: "Discovered",
  processing: "Processing",
  ready: "Ready",
  applied: "Applied",
  skipped: "Skipped",
  expired: "Expired",
};

const statusStyles: Record<
  JobStatus,
  {
    variant: "default" | "secondary" | "destructive" | "outline";
    className?: string;
  }
> = {
  discovered: { variant: "secondary" },
  processing: { variant: "secondary" },
  ready: { variant: "default" },
  applied: {
    variant: "outline",
    className: "text-emerald-400 border-emerald-500/30",
  },
  skipped: { variant: "destructive" },
  expired: { variant: "outline", className: "text-muted-foreground" },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const { variant, className } = statusStyles[status];

  return (
    <Badge variant={variant} className={cn("gap-1", className)}>
      {status === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
      {statusLabels[status]}
    </Badge>
  );
};
