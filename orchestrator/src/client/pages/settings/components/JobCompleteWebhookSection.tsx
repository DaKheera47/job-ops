import React from "react"

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type JobCompleteWebhookSectionProps = {
  jobCompleteWebhookUrlDraft: string
  setJobCompleteWebhookUrlDraft: (value: string) => void
  defaultJobCompleteWebhookUrl: string
  effectiveJobCompleteWebhookUrl: string
  isLoading: boolean
  isSaving: boolean
}

export const JobCompleteWebhookSection: React.FC<JobCompleteWebhookSectionProps> = ({
  jobCompleteWebhookUrlDraft,
  setJobCompleteWebhookUrlDraft,
  defaultJobCompleteWebhookUrl,
  effectiveJobCompleteWebhookUrl,
  isLoading,
  isSaving,
}) => {
  return (
    <AccordionItem value="job-complete-webhook" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Job Complete Webhook</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Job completion webhook URL</div>
            <Input
              value={jobCompleteWebhookUrlDraft}
              onChange={(event) => setJobCompleteWebhookUrlDraft(event.target.value)}
              placeholder={defaultJobCompleteWebhookUrl || "https://..."}
              disabled={isLoading || isSaving}
            />
            <div className="text-xs text-muted-foreground">
              When set, the server sends a POST when you mark a job as applied (includes the job description).
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Effective</div>
              <div className="break-words font-mono text-xs">{effectiveJobCompleteWebhookUrl || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default (env)</div>
              <div className="break-words font-mono text-xs">{defaultJobCompleteWebhookUrl || "—"}</div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
