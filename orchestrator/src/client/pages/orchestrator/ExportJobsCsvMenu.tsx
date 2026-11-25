import type { JobListItem } from "@shared/types";
import { Download } from "lucide-react";
import { downloadJobsCsv } from "@/client/lib/jobs-csv";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ExportJobsCsvMenu({
  jobs,
  selectedJobIds,
  disabled = false,
}: {
  jobs: readonly JobListItem[];
  selectedJobIds: ReadonlySet<string>;
  disabled?: boolean;
}) {
  const selectedJobs = jobs.filter((job) => selectedJobIds.has(job.id));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={disabled || jobs.length === 0}
          aria-label="Export jobs as CSV"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export CSV
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => downloadJobsCsv(jobs, "filtered")}>
          Filtered jobs ({jobs.length})
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={selectedJobs.length === 0}
          onSelect={() => downloadJobsCsv(selectedJobs, "selected")}
        >
          Selected jobs ({selectedJobs.length})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
