import { parseSearchTermsInput } from "@client/pages/orchestrator/automatic-run";
import { TokenizedInput } from "@client/pages/orchestrator/TokenizedInput";
import type { SearchTermsSuggestionResponse } from "@shared/types";
import { Info, RefreshCcw } from "lucide-react";
import type React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const SearchTermsStep: React.FC<{
  hasSavedSearchTermsInSession: boolean;
  isBusy: boolean;
  isGeneratingSearchTerms: boolean;
  searchTermDraft: string;
  searchTerms: string[];
  searchTermsSource: SearchTermsSuggestionResponse["source"] | null;
  searchTermsStale: boolean;
  onRegenerate: () => Promise<void>;
  onSearchTermDraftChange: (value: string) => void;
  onSearchTermsChange: (values: string[]) => void;
}> = ({
  hasSavedSearchTermsInSession,
  isBusy,
  isGeneratingSearchTerms,
  searchTermDraft,
  searchTerms,
  searchTermsSource,
  searchTermsStale,
  onRegenerate,
  onSearchTermDraftChange,
  onSearchTermsChange,
}) => (
  <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/10 p-5">
      <div className="max-w-2xl space-y-1">
        <div className="text-sm font-medium">Titles to search for</div>
        <p className="text-sm leading-6 text-muted-foreground">
          Pick the job titles Job Ops should search for. The first list can be
          generated from your resume, and you can edit every item before saving.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        disabled={isBusy || isGeneratingSearchTerms}
        onClick={() => void onRegenerate()}
      >
        <RefreshCcw className="h-4 w-4" />
        {isGeneratingSearchTerms ? "Generating..." : "Regenerate from resume"}
      </Button>
    </div>

    {searchTermsStale ? (
      <Alert variant="warning">
        <Info className="h-4 w-4" />
        <AlertTitle>Resume changed</AlertTitle>
        <AlertDescription>
          Your resume source changed after these search terms were generated or
          saved. Refresh or edit the list, then save it again.
        </AlertDescription>
      </Alert>
    ) : searchTermsSource ? (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>
          {searchTermsSource === "ai"
            ? "Generated from your resume"
            : "Suggested from your resume"}
        </AlertTitle>
        <AlertDescription>
          {searchTermsSource === "ai"
            ? "These titles were generated from your current resume. Adjust anything that feels off before saving."
            : "Job Ops used a simpler resume-based fallback list. You can edit or regenerate it before saving."}
        </AlertDescription>
      </Alert>
    ) : hasSavedSearchTermsInSession ? (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Saved search terms</AlertTitle>
        <AlertDescription>
          These titles are already saved and will be used for job discovery
          unless you update them.
        </AlertDescription>
      </Alert>
    ) : null}

    <TokenizedInput
      id="onboarding-search-terms"
      values={searchTerms}
      draft={searchTermDraft}
      parseInput={parseSearchTermsInput}
      onDraftChange={onSearchTermDraftChange}
      onValuesChange={onSearchTermsChange}
      placeholder="Type a role and press Enter"
      helperText="Examples: Platform Engineer, Senior Backend Engineer, Staff Software Engineer"
      removeLabelPrefix="Remove search term"
      disabled={isBusy}
    />
  </div>
);
