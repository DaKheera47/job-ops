/**
 * Individual job card component.
 */

import React from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Copy,
  DollarSign,
  Download,
  Edit2,
  ExternalLink,
  GraduationCap,
  Loader2,
  MapPin,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { copyTextToClipboard, formatJobForWebhook } from "@client/lib/jobCopy";
import type { Job } from "../../shared/types";
import { ScoreIndicator } from "./ScoreIndicator";
import { StatusBadge } from "./StatusBadge";

interface JobCardProps {
  job: Job;
  onApply: (id: string) => void | Promise<void>;
  onReject: (id: string) => void | Promise<void>;
  onProcess: (id: string) => void | Promise<void>;
  onEditDescription?: (id: string) => void;
  isProcessing: boolean;
  highlightedJobId?: string | null;
  onHighlightChange?: (jobId: string | null) => void;
}

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

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return null;
  try {
    const normalized = dateStr.includes("T") ? dateStr : dateStr.replace(" ", "T");
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return dateStr;
    const date = parsed.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    const time = parsed.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} ${time}`;
  } catch {
    return dateStr;
  }
};

const safeFilenamePart = (value: string) => value.replace(/[^a-z0-9]/gi, "_");

export const JobCard: React.FC<JobCardProps> = ({
  job,
  onApply,
  onReject,
  onProcess,
  onEditDescription,
  isProcessing,
  highlightedJobId,
  onHighlightChange,
}) => {
  const sourceLabel: Record<Job["source"], string> = {
    gradcracker: "Gradcracker",
    indeed: "Indeed",
    linkedin: "LinkedIn",
    ukvisajobs: "UK Visa Jobs",
  };

  const hasPdf = !!job.pdfPath;
  const canApply = job.status === "ready";
  const canProcess = ["discovered", "ready"].includes(job.status);
  const canReject = ["discovered", "ready"].includes(job.status);

  const jobLink = job.applicationLink || job.jobUrl;
  const pdfHref = `/pdfs/resume_${job.id}.pdf?v=${encodeURIComponent(job.updatedAt)}`;
  const deadline = formatDate(job.deadline);
  const discoveredAt = formatDateTime(job.discoveredAt);
  const isHighlighted = highlightedJobId === job.id;

  const handleCopyInfo = async () => {
    try {
      await copyTextToClipboard(formatJobForWebhook(job));
      toast.success("Copied job info", { description: "Webhook payload copied to clipboard." });
    } catch {
      toast.error("Could not copy job info");
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 space-y-1">
            <CardTitle className="text-base leading-tight">{job.title}</CardTitle>
            <div className="text-sm text-muted-foreground">{job.employer}</div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <ScoreIndicator score={job.suitabilityScore} />
            <Badge variant="outline" className="uppercase tracking-wide">
              {sourceLabel[job.source]}
            </Badge>
            <StatusBadge status={job.status} />
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
          {job.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {job.location}
            </span>
          )}
          {deadline && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {deadline}
            </span>
          )}
          {discoveredAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Discovered {discoveredAt}
            </span>
          )}
          {job.salary && (
            <span className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              {job.salary}
            </span>
          )}
          {job.degreeRequired && (
            <span className="flex items-center gap-1">
              <GraduationCap className="h-4 w-4" />
              {job.degreeRequired}
            </span>
          )}
        </div>
      </CardHeader>

      {(job.suitabilityReason || canApply || canReject || canProcess || hasPdf) && (
        <CardContent className="space-y-3">
          {job.suitabilityReason && (
            <p className="text-sm italic text-muted-foreground">
              &quot;{job.suitabilityReason}&quot;
            </p>
          )}
        </CardContent>
      )}

      <CardFooter className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <a href={jobLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            View Job
          </a>
        </Button>

        <Button variant="outline" size="sm" onClick={handleCopyInfo}>
          <Copy className="mr-2 h-4 w-4" />
          Copy info
        </Button>

        {onEditDescription && (
          <Button variant="outline" size="sm" onClick={() => onEditDescription(job.id)}>
            <Edit2 className="mr-2 h-4 w-4" />
            Edit JD
          </Button>
        )}

        {onHighlightChange && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onHighlightChange(isHighlighted ? null : job.id)}
          >
            {isHighlighted ? "Unhighlight" : "Highlight"}
          </Button>
        )}

        {hasPdf && (
          <Button asChild variant="outline" size="sm">
            <a href={pdfHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              View PDF
            </a>
          </Button>
        )}

        {hasPdf && (
          <Button asChild variant="outline" size="sm">
            <a
              href={pdfHref}
              download={`Shaheer_Sarfaraz_${safeFilenamePart(job.employer)}.pdf`}
            >
              <Download className="mr-2 h-4 w-4" />
              Download
            </a>
          </Button>
        )}

        {canProcess && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onProcess(job.id)}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <RefreshCcw className="mr-2 h-4 w-4" />
                {job.status === "ready" ? "Regenerate PDF" : "Generate Resume"}
              </>
            )}
          </Button>
        )}

        {canReject && (
          <Button variant="destructive" size="sm" onClick={() => onReject(job.id)}>
            <XCircle className="mr-2 h-4 w-4" />
            Skip
          </Button>
        )}

        {canApply && (
          <Button size="sm" onClick={() => onApply(job.id)}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Mark Applied
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};
