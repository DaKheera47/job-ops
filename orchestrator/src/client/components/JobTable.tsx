/**
 * Table-based job list view.
 */

import React from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  Download,
  ExternalLink,
  MoreHorizontal,
  RefreshCcw,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Job } from "../../shared/types";
import { StatusBadge } from "./StatusBadge";

export type JobSortKey =
  | "title"
  | "employer"
  | "source"
  | "location"
  | "status"
  | "score"
  | "discoveredAt";

export type JobSortDirection = "asc" | "desc";

export interface JobSort {
  key: JobSortKey;
  direction: JobSortDirection;
}

export interface JobTableProps {
  jobs: Job[];
  sort: JobSort;
  onSortChange: (sort: JobSort) => void;
  onApply: (id: string) => void;
  onReject: (id: string) => void;
  onProcess: (id: string) => void;
  processingJobId: string | null;
}

const sourceLabel: Record<Job["source"], string> = {
  gradcracker: "Gradcracker",
  indeed: "Indeed",
  linkedin: "LinkedIn",
};

const defaultSortDirection: Record<JobSortKey, JobSortDirection> = {
  title: "asc",
  employer: "asc",
  source: "asc",
  location: "asc",
  status: "asc",
  score: "desc",
  discoveredAt: "desc",
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
};

const safeFilenamePart = (value: string) => value.replace(/[^a-z0-9]/gi, "_");

const SortButton: React.FC<{
  label: string;
  sortKey: JobSortKey;
  sort: JobSort;
  onSortChange: (sort: JobSort) => void;
  className?: string;
}> = ({ label, sortKey, sort, onSortChange, className }) => {
  const isActive = sort.key === sortKey;
  const Icon = isActive ? (sort.direction === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => {
        if (!isActive) {
          onSortChange({ key: sortKey, direction: defaultSortDirection[sortKey] });
          return;
        }
        onSortChange({
          key: sortKey,
          direction: sort.direction === "asc" ? "desc" : "asc",
        });
      }}
      className={cn("h-8 w-full justify-start -mx-2 px-2 font-medium", className)}
    >
      {label}
      <Icon className={cn("ml-1 h-3.5 w-3.5", !isActive && "opacity-60")} />
    </Button>
  );
};

export const JobTable: React.FC<JobTableProps> = ({
  jobs,
  sort,
  onSortChange,
  onApply,
  onReject,
  onProcess,
  processingJobId,
}) => {
  return (
    <Table className="table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[28%]">
            <SortButton label="Title" sortKey="title" sort={sort} onSortChange={onSortChange} />
          </TableHead>
          <TableHead className="w-[18%]">
            <SortButton label="Company" sortKey="employer" sort={sort} onSortChange={onSortChange} />
          </TableHead>
          <TableHead>
            <SortButton label="Source" sortKey="source" sort={sort} onSortChange={onSortChange} />
          </TableHead>
          <TableHead>
            <SortButton label="Location" sortKey="location" sort={sort} onSortChange={onSortChange} />
          </TableHead>
          <TableHead>
            <SortButton label="Status" sortKey="status" sort={sort} onSortChange={onSortChange} />
          </TableHead>
          <TableHead className="w-[10%] text-right">
            <SortButton
              label="Score"
              sortKey="score"
              sort={sort}
              onSortChange={onSortChange}
              className="justify-end"
            />
          </TableHead>
          <TableHead>
            <SortButton
              label="Discovered"
              sortKey="discoveredAt"
              sort={sort}
              onSortChange={onSortChange}
            />
          </TableHead>
          <TableHead className="w-[1%] pr-3 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {jobs.map((job) => {
          const jobLink = job.applicationLink || job.jobUrl;
          const hasPdf = !!job.pdfPath;
          const pdfHref = `/pdfs/resume_${job.id}.pdf`;

          const canApply = job.status === "ready";
          const canProcess = job.status === "discovered";
          const canReject = ["discovered", "ready"].includes(job.status);
          const isProcessing = processingJobId === job.id;

          return (
            <TableRow key={job.id}>
              <TableCell className="align-top">
                <Button
                  asChild
                  variant="link"
                  size="sm"
                  className="h-auto justify-start p-0 text-left leading-snug whitespace-normal break-words"
                >
                  <a href={jobLink} target="_blank" rel="noopener noreferrer">
                    {job.title}
                  </a>
                </Button>
              </TableCell>

              <TableCell className="align-top whitespace-normal break-words">
                {job.employer}
              </TableCell>

              <TableCell>
                <Badge variant="outline" className="uppercase tracking-wide">
                  {sourceLabel[job.source]}
                </Badge>
              </TableCell>

              <TableCell className="align-top whitespace-normal break-words text-muted-foreground">
                {job.location || "—"}
              </TableCell>

              <TableCell>
                <StatusBadge status={job.status} />
              </TableCell>

              <TableCell className="text-right tabular-nums text-muted-foreground">
                {job.suitabilityScore ?? "—"}
              </TableCell>

              <TableCell className="tabular-nums text-muted-foreground">
                {formatDate(job.discoveredAt)}
              </TableCell>

              <TableCell className="pr-3 text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Open actions menu">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="end">
                    <DropdownMenuItem asChild>
                      <a href={jobLink} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        View Job
                      </a>
                    </DropdownMenuItem>

                    {hasPdf && (
                      <>
                        <DropdownMenuItem asChild>
                          <a href={pdfHref} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="mr-2 h-4 w-4" />
                            View PDF
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a
                            href={pdfHref}
                            download={`resume_${safeFilenamePart(job.employer)}_${safeFilenamePart(job.title)}.pdf`}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download PDF
                          </a>
                        </DropdownMenuItem>
                      </>
                    )}

                    {(canProcess || canReject || canApply) && <DropdownMenuSeparator />}

                    {canProcess && (
                      <DropdownMenuItem
                        onSelect={() => onProcess(job.id)}
                        disabled={isProcessing}
                      >
                        <RefreshCcw className="mr-2 h-4 w-4" />
                        {isProcessing ? "Processing..." : "Generate Resume"}
                      </DropdownMenuItem>
                    )}

                    {canReject && (
                      <DropdownMenuItem
                        onSelect={() => onReject(job.id)}
                      >
                        <XCircle className="mr-2 h-4 w-4" />
                        Skip
                      </DropdownMenuItem>
                    )}

                    {canApply && (
                      <DropdownMenuItem
                        onSelect={() => onApply(job.id)}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Mark Applied
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
