/**
 * Stats dashboard showing job counts by status.
 */

import type { JobStatus } from "@shared/types.js";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import type React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface StatsProps {
  stats: Record<JobStatus, number>;
}

const statConfig: Array<{
  key: JobStatus;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "discovered", label: "Discovered", Icon: Search },
  { key: "processing", label: "Processing", Icon: Loader2 },
  { key: "ready", label: "Ready", Icon: Sparkles },
  { key: "applied", label: "Applied", Icon: CheckCircle2 },
  { key: "in_progress", label: "In Progress", Icon: CheckCircle2 },
  { key: "skipped", label: "Skipped", Icon: XCircle },
  { key: "expired", label: "Expired", Icon: Clock },
];

export const Stats: React.FC<StatsProps> = ({ stats }) => {
  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Overview</CardTitle>
        <div className="text-sm text-muted-foreground">{total} total jobs</div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
          {statConfig.map(({ key, label, Icon }) => (
            <Card key={key} className="bg-muted/20">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-background/40 text-muted-foreground">
                    <Icon
                      className={
                        key === "processing"
                          ? "h-4 w-4 animate-spin"
                          : "h-4 w-4"
                      }
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-semibold tabular-nums leading-none">
                      {stats[key] || 0}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {label}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
