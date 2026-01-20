import React from "react"

import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Separator } from "@/components/ui/separator"

type SearchTermsSectionProps = {
  searchTermsDraft: string[] | null
  setSearchTermsDraft: (value: string[] | null) => void
  defaultSearchTerms: string[]
  effectiveSearchTerms: string[]
  isLoading: boolean
  isSaving: boolean
}

export const SearchTermsSection: React.FC<SearchTermsSectionProps> = ({
  searchTermsDraft,
  setSearchTermsDraft,
  defaultSearchTerms,
  effectiveSearchTerms,
  isLoading,
  isSaving,
}) => {
  return (
    <AccordionItem value="search-terms" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Search Terms</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-sm font-medium">Global search terms</div>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={searchTermsDraft ? searchTermsDraft.join('\n') : (defaultSearchTerms ?? []).join('\n')}
              onChange={(event) => {
                const text = event.target.value
                const terms = text.split('\n') // Don't filter here to allow empty lines while typing
                setSearchTermsDraft(terms)
              }}
              onBlur={() => {
                // Clean up on blur
                if (searchTermsDraft) {
                  setSearchTermsDraft(searchTermsDraft.map(t => t.trim()).filter(Boolean))
                }
              }}
              placeholder="e.g. web developer"
              disabled={isLoading || isSaving}
              rows={5}
            />
            <div className="text-xs text-muted-foreground">
              One term per line. Applies to UKVisaJobs and other supported extractors.
            </div>
          </div>

          <Separator />

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Effective</div>
              <div className="break-words font-mono text-xs">{(effectiveSearchTerms || []).join(', ') || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Default (env)</div>
              <div className="break-words font-mono text-xs">{(defaultSearchTerms || []).join(', ') || "—"}</div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  )
}
