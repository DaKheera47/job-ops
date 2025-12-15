/**
 * Individual job card component.
 */

import React from "react";
import {
  Calendar,
  CheckCircle2,
  Copy,
  DollarSign,
  Download,
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
import { copyTextToClipboard, formatJobForLlmContext } from "@client/lib/jobCopy";
import type { Job } from "../../shared/types";
import { ScoreIndicator } from "./ScoreIndicator";
import { StatusBadge } from "./StatusBadge";

interface JobCardProps {
  job: Job;
  onApply: (id: string) => void | Promise<void>;
  onReject: (id: string) => void | Promise<void>;
  onProcess: (id: string) => void | Promise<void>;
  isProcessing: boolean;
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

const safeFilenamePart = (value: string) => value.replace(/[^a-z0-9]/gi, "_");

export const JobCard: React.FC<JobCardProps> = ({
  job,
  onApply,
  onReject,
  onProcess,
  isProcessing,
}) => {
  const sourceLabel: Record<Job["source"], string> = {
    gradcracker: "Gradcracker",
    indeed: "Indeed",
    linkedin: "LinkedIn",
  };

  const hasPdf = !!job.pdfPath;
  const canApply = job.status === "ready";
  const canProcess = job.status === "discovered";
  const canReject = ["discovered", "ready"].includes(job.status);

  const jobLink = job.applicationLink || job.jobUrl;
  const pdfHref = `/pdfs/resume_${job.id}.pdf`;
  const deadline = formatDate(job.deadline);

  const handleCopyInfo = async () => {
    try {
      await copyTextToClipboard(formatJobForLlmContext(job));
      toast.success("Copied job info", { description: "LLM-ready context copied to clipboard." });
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
              download={`resume_${safeFilenamePart(job.employer)}_${safeFilenamePart(job.title)}.pdf`}
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
                Generate Resume
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
