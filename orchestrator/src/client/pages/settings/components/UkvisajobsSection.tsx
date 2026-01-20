import React from "react"

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type UkvisajobsSectionProps = {
  ukvisajobsMaxJobsDraft: number | null
  setUkvisajobsMaxJobsDraft: (value: number | null) => void
  defaultUkvisajobsMaxJobs: number
  effectiveUkvisajobsMaxJobs: number
  isLoading: boolean
  isSaving: boolean
}

export const UkvisajobsSection: React.FC<UkvisajobsSectionProps> = ({
  ukvisajobsMaxJobsDraft,
  setUkvisajobsMaxJobsDraft,
  defaultUkvisajobsMaxJobs,
  effectiveUkvisajobsMaxJobs,
  isLoading,
  isSaving,
}) => {
  return (
    <AccordionItem value="ukvisajobs" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">UKVisaJobs Extractor</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Max jobs to fetch</div>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={1000}
              value={ukvisajobsMaxJobsDraft ?? defaultUkvisajobsMaxJobs}
              onChange={(event) => {
                const value = parseInt(event.target.value, 10)
                if (Number.isNaN(value)) {
                  setUkvisajobsMaxJobsDraft(null)
                } else {
                  setUkvisajobsMaxJobsDraft(Math.min(1000, Math.max(1, value)))
                }
              }}
              disabled={isLoading || isSaving}
            />
            <div className="text-xs text-muted-foreground">
              Maximum number of jobs to fetch from UKVisaJobs per pipeline run. Range: 1-1000.
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Effective</div>
              <div className="break-words font-mono text-xs">{effectiveUkvisajobsMaxJobs}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default</div>
              <div className="break-words font-mono text-xs font-semibold">{defaultUkvisajobsMaxJobs}</div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
