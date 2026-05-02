import type { ApplicationTask, Job } from "@shared/types.js";
import {
  CalendarClock,
  CheckCircle2,
  Copy,
  Edit2,
  ExternalLink,
  FileText,
  MoreHorizontal,
  PlusCircle,
  RefreshCcw,
  Sparkles,
  Upload,
  XCircle,
} from "lucide-react";
import type React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatTimestamp } from "@/lib/utils";

type JobPageRightSidebarProps = {
  job: Job;
  tasks: ApplicationTask[];
  jobLink: string | null;
  isDiscovered: boolean;
  isReady: boolean;
  isApplied: boolean;
  isInProgress: boolean;
  canLogEvents: boolean;
  isBusy: boolean;
  isUploadingPdf: boolean;
  onStartTailoring: () => void;
  onMarkApplied: () => void;
  onMoveToInProgress: () => void;
  onOpenLogEvent: () => void;
  onEditTailoring: () => void;
  onViewPdf: () => void;
  onUploadPdf: () => void;
  onRegeneratePdf: () => void;
  onSkip: () => void;
  onOpenEditDetails: () => void;
  onCopyJobInfo: () => void;
  onRescore: () => void;
  onCheckSponsor: () => void;
};

export const JobPageRightSidebar: React.FC<JobPageRightSidebarProps> = ({
  job,
  tasks,
  jobLink,
  isDiscovered,
  isReady,
  isApplied,
  isInProgress,
  canLogEvents,
  isBusy,
  isUploadingPdf,
  onStartTailoring,
  onMarkApplied,
  onMoveToInProgress,
  onOpenLogEvent,
  onEditTailoring,
  onViewPdf,
  onUploadPdf,
  onRegeneratePdf,
  onSkip,
  onOpenEditDetails,
  onCopyJobInfo,
  onRescore,
  onCheckSponsor,
}) => (
  <aside className="space-y-4 xl:sticky xl:top-5">
    <section className="rounded-xl border border-border/50 bg-card/85 p-3">
      <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
        Actions
      </div>
      <div className="space-y-2">
        {jobLink && (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="w-full justify-start"
          >
            <a href={jobLink} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Open Job Listing
            </a>
          </Button>
        )}

        {isDiscovered && (
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start"
            onClick={onStartTailoring}
            disabled={isBusy}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Start Tailoring
          </Button>
        )}

        {isReady && (
          <Button
            size="sm"
            className="w-full justify-start"
            variant="outline"
            onClick={onMarkApplied}
            disabled={isBusy}
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Mark Applied
          </Button>
        )}

        {isApplied && (
          <Button
            size="sm"
            className="w-full justify-start"
            variant="outline"
            onClick={onMoveToInProgress}
            disabled={isBusy}
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Move to In Progress
          </Button>
        )}

        {isInProgress && (
          <Button
            size="sm"
            className="w-full justify-start"
            variant="outline"
            onClick={onOpenLogEvent}
            disabled={!canLogEvents || isBusy}
          >
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
            Log event
          </Button>
        )}

        {isReady && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full justify-start"
            onClick={onEditTailoring}
            disabled={isBusy}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5" />
            Edit Tailoring
          </Button>
        )}

        {job.pdfPath && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full justify-start"
            onClick={onViewPdf}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" />
            View PDF
          </Button>
        )}

        <Button
          size="sm"
          variant="outline"
          className="h-9 w-full justify-start"
          onClick={onUploadPdf}
          disabled={isUploadingPdf}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          {isUploadingPdf
            ? "Uploading PDF"
            : job.pdfPath
              ? "Replace PDF"
              : "Upload PDF"}
        </Button>

        {isReady && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full justify-start"
            onClick={onRegeneratePdf}
            disabled={isBusy}
          >
            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
            Regenerate PDF
          </Button>
        )}

        {(isReady || isDiscovered) && (
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full justify-start"
            onClick={onSkip}
            disabled={isBusy}
          >
            <XCircle className="mr-1.5 h-3.5 w-3.5" />
            Skip Job
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-full justify-start text-muted-foreground"
            >
              <MoreHorizontal className="mr-1.5 h-3.5 w-3.5" />
              More actions
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpenEditDetails}>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCopyJobInfo}>
              <Copy className="mr-2 h-4 w-4" />
              Copy job info
            </DropdownMenuItem>
            {(isReady || isDiscovered) && (
              <DropdownMenuItem onSelect={onRescore}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Recalculate match
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCheckSponsor}>
              Check sponsorship status
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </section>

    {tasks.length > 0 && (
      <section className="rounded-xl border border-border/50 bg-card/70 p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4" />
          Upcoming tasks
        </div>
        <div className="space-y-3">
          {tasks.map((task) => (
            <div key={task.id} className="space-y-1">
              <div className="text-sm font-medium">{task.title}</div>
              {task.notes && (
                <div className="text-xs text-muted-foreground">
                  {task.notes}
                </div>
              )}
              <Badge
                variant="outline"
                className="text-[10px] uppercase tracking-wide"
              >
                {formatTimestamp(task.dueDate)}
              </Badge>
            </div>
          ))}
        </div>
      </section>
    )}
  </aside>
);
