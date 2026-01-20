import React from "react"

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type JobspySectionProps = {
  jobspySitesDraft: string[] | null
  setJobspySitesDraft: (value: string[] | null) => void
  defaultJobspySites: string[]
  effectiveJobspySites: string[]
  jobspyLocationDraft: string | null
  setJobspyLocationDraft: (value: string | null) => void
  defaultJobspyLocation: string
  effectiveJobspyLocation: string
  jobspyResultsWantedDraft: number | null
  setJobspyResultsWantedDraft: (value: number | null) => void
  defaultJobspyResultsWanted: number
  effectiveJobspyResultsWanted: number
  jobspyHoursOldDraft: number | null
  setJobspyHoursOldDraft: (value: number | null) => void
  defaultJobspyHoursOld: number
  effectiveJobspyHoursOld: number
  jobspyCountryIndeedDraft: string | null
  setJobspyCountryIndeedDraft: (value: string | null) => void
  defaultJobspyCountryIndeed: string
  effectiveJobspyCountryIndeed: string
  jobspyLinkedinFetchDescriptionDraft: boolean | null
  setJobspyLinkedinFetchDescriptionDraft: (value: boolean | null) => void
  defaultJobspyLinkedinFetchDescription: boolean
  effectiveJobspyLinkedinFetchDescription: boolean
  isLoading: boolean
  isSaving: boolean
}

export const JobspySection: React.FC<JobspySectionProps> = ({
  jobspySitesDraft,
  setJobspySitesDraft,
  defaultJobspySites,
  effectiveJobspySites,
  jobspyLocationDraft,
  setJobspyLocationDraft,
  defaultJobspyLocation,
  effectiveJobspyLocation,
  jobspyResultsWantedDraft,
  setJobspyResultsWantedDraft,
  defaultJobspyResultsWanted,
  effectiveJobspyResultsWanted,
  jobspyHoursOldDraft,
  setJobspyHoursOldDraft,
  defaultJobspyHoursOld,
  effectiveJobspyHoursOld,
  jobspyCountryIndeedDraft,
  setJobspyCountryIndeedDraft,
  defaultJobspyCountryIndeed,
  effectiveJobspyCountryIndeed,
  jobspyLinkedinFetchDescriptionDraft,
  setJobspyLinkedinFetchDescriptionDraft,
  defaultJobspyLinkedinFetchDescription,
  effectiveJobspyLinkedinFetchDescription,
  isLoading,
  isSaving,
}) => {
  return (
    <AccordionItem value="jobspy" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">JobSpy Scraper</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="text-sm font-medium">Scraped Sites</div>
            <div className="flex gap-6">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="site-indeed"
                  checked={jobspySitesDraft?.includes('indeed') ?? defaultJobspySites.includes('indeed')}
                  onCheckedChange={(checked) => {
                    const current = jobspySitesDraft ?? defaultJobspySites
                    let next = [...current]
                    if (checked) {
                      if (!next.includes('indeed')) next.push('indeed')
                    } else {
                      next = next.filter(s => s !== 'indeed')
                    }
                    setJobspySitesDraft(next)
                  }}
                  disabled={isLoading || isSaving}
                />
                <label htmlFor="site-indeed" className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Indeed</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="site-linkedin"
                  checked={jobspySitesDraft?.includes('linkedin') ?? defaultJobspySites.includes('linkedin')}
                  onCheckedChange={(checked) => {
                    const current = jobspySitesDraft ?? defaultJobspySites
                    let next = [...current]
                    if (checked) {
                      if (!next.includes('linkedin')) next.push('linkedin')
                    } else {
                      next = next.filter(s => s !== 'linkedin')
                    }
                    setJobspySitesDraft(next)
                  }}
                  disabled={isLoading || isSaving}
                />
                <label htmlFor="site-linkedin" className="text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">LinkedIn</label>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Select which sites JobSpy should scrape.
            </div>
            <div className="flex gap-2 text-xs text-muted-foreground">
              <span>Effective: {(effectiveJobspySites || []).join(', ') || "None"}</span>
              <span>Default: {(defaultJobspySites || []).join(', ')}</span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <div className="text-sm font-medium">Location</div>
              <Input
                value={jobspyLocationDraft ?? defaultJobspyLocation}
                onChange={(event) => setJobspyLocationDraft(event.target.value)}
                placeholder={defaultJobspyLocation || "UK"}
                disabled={isLoading || isSaving}
              />
              <div className="text-xs text-muted-foreground">
                Location to search for jobs (e.g. "UK", "London", "Remote").
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Effective: {effectiveJobspyLocation || "—"}</span>
                <span>Default: {defaultJobspyLocation || "—"}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Results Wanted</div>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={500}
                value={jobspyResultsWantedDraft ?? defaultJobspyResultsWanted}
                onChange={(event) => {
                  const value = parseInt(event.target.value, 10)
                  if (Number.isNaN(value)) {
                    setJobspyResultsWantedDraft(null)
                  } else {
                    setJobspyResultsWantedDraft(Math.min(500, Math.max(1, value)))
                  }
                }}
                disabled={isLoading || isSaving}
              />
              <div className="text-xs text-muted-foreground">
                Number of results to fetch per term per site. Max 500.
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Effective: {effectiveJobspyResultsWanted}</span>
                <span>Default: {defaultJobspyResultsWanted}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Hours Old</div>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={168}
                value={jobspyHoursOldDraft ?? defaultJobspyHoursOld}
                onChange={(event) => {
                  const value = parseInt(event.target.value, 10)
                  if (Number.isNaN(value)) {
                    setJobspyHoursOldDraft(null)
                  } else {
                    setJobspyHoursOldDraft(Math.min(168, Math.max(1, value)))
                  }
                }}
                disabled={isLoading || isSaving}
              />
              <div className="text-xs text-muted-foreground">
                Max age of jobs in hours (e.g. 72 for 3 days).
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Effective: {effectiveJobspyHoursOld}h</span>
                <span>Default: {defaultJobspyHoursOld}h</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Indeed Country</div>
              <Input
                value={jobspyCountryIndeedDraft ?? defaultJobspyCountryIndeed}
                onChange={(event) => setJobspyCountryIndeedDraft(event.target.value)}
                placeholder={defaultJobspyCountryIndeed || "UK"}
                disabled={isLoading || isSaving}
              />
              <div className="text-xs text-muted-foreground">
                Country domain for Indeed (e.g. "UK" for indeed.co.uk).
              </div>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Effective: {effectiveJobspyCountryIndeed || "—"}</span>
                <span>Default: {defaultJobspyCountryIndeed || "—"}</span>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-center space-x-2">
            <Checkbox
              id="linkedin-desc"
              checked={jobspyLinkedinFetchDescriptionDraft ?? defaultJobspyLinkedinFetchDescription}
              onCheckedChange={(checked) => setJobspyLinkedinFetchDescriptionDraft(!!checked)}
              disabled={isLoading || isSaving}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="linkedin-desc"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Fetch LinkedIn Description
              </label>
              <p className="text-xs text-muted-foreground">
                If enabled, JobSpy will make extra requests to fetch full descriptions. Slower but better data.
              </p>
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span>Effective: {effectiveJobspyLinkedinFetchDescription ? "Yes" : "No"}</span>
                <span>Default: {defaultJobspyLinkedinFetchDescription ? "Yes" : "No"}</span>
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
