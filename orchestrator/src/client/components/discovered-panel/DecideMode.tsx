import React, { useMemo, useState } from "react";
import { ExternalLink, Loader2, Sparkles, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { FitAssessment, JobHeader, TailoredSummary } from "..";
import type { Job } from "../../../shared/types";
import { CollapsibleSection } from "./CollapsibleSection";
import { getPlainDescription } from "./helpers";

interface DecideModeProps {
  job: Job;
  onTailor: () => void;
  onSkip: () => void;
  isSkipping: boolean;
  onCheckSponsor?: () => Promise<void>;
}

export const DecideMode: React.FC<DecideModeProps> = ({
  job,
  onTailor,
  onSkip,
  isSkipping,
  onCheckSponsor,
}) => {
  const [showDescription, setShowDescription] = useState(false);
  const jobLink = job.applicationLink || job.jobUrl;

  const description = useMemo(
    () => getPlainDescription(job.jobDescription),
    [job.jobDescription]
  );

  return (
    <div className='flex flex-col h-full'>
      <div className='space-y-4 pb-4'>
        <JobHeader
          job={job}
          onCheckSponsor={onCheckSponsor}
        />

        <div className='flex flex-col gap-2.5 pt-2 sm:flex-row'>
          <Button
            variant='outline'
            size='default'
            onClick={onSkip}
            disabled={isSkipping}
            className='flex-1 h-11 text-sm text-muted-foreground hover:text-rose-500 hover:border-rose-500/30 hover:bg-rose-500/5 sm:h-10 sm:text-xs'
          >
            {isSkipping ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : (
              <XCircle className='mr-2 h-4 w-4' />
            )}
            Skip Job
          </Button>
          <Button
            size='default'
            onClick={onTailor}
            className='flex-1 h-11 text-sm bg-primary/90 hover:bg-primary sm:h-10 sm:text-xs shadow-sm'
          >
            <Sparkles className='mr-2 h-4 w-4' />
            Start Tailoring
          </Button>
        </div>
      </div>

      <Separator className='opacity-40' />

      <div className='flex-1 py-6 space-y-6 overflow-y-auto'>
        <FitAssessment job={job} />
        <TailoredSummary job={job} />

        <CollapsibleSection
          isOpen={showDescription}
          onToggle={() => setShowDescription((prev) => !prev)}
          label={`${showDescription ? "Hide" : "View"} Full Job Description`}
        >
          <div className='rounded-xl border border-border/40 bg-muted/5 p-4 mt-2 max-h-[400px] overflow-y-auto shadow-inner'>
            <p className='text-xs text-muted-foreground/90 whitespace-pre-wrap leading-relaxed'>
              {description}
            </p>
          </div>
        </CollapsibleSection>
      </div>

      <Separator className='opacity-40' />

      <div className='pt-6 pb-2'>
        {jobLink ? (
          <div className='flex justify-center'>
            <a
              href={jobLink}
              target='_blank'
              rel='noopener noreferrer'
              className='inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors'
            >
              <ExternalLink className='h-3.5 w-3.5' />
              Original Job Listing
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
};

