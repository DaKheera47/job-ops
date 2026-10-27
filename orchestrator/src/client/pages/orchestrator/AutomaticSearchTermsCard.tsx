import { Label } from "@/components/ui/label";
import { parseSearchTermsInput } from "./automatic-run";
import { TokenizedInput } from "./TokenizedInput";

interface AutomaticSearchTermsCardProps {
  searchTerms: string[];
  searchTermDraft: string;
  onSearchTermDraftChange: (value: string) => void;
  onSearchTermsChange: (value: string[]) => void;
}

export function AutomaticSearchTermsCard({
  searchTerms,
  searchTermDraft,
  onSearchTermDraftChange,
  onSearchTermsChange,
}: AutomaticSearchTermsCardProps) {
  return (
    <div className="pb-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="search-terms-input">Search terms</Label>
        <TokenizedInput
          id="search-terms-input"
          values={searchTerms}
          draft={searchTermDraft}
          parseInput={parseSearchTermsInput}
          onDraftChange={onSearchTermDraftChange}
          onValuesChange={onSearchTermsChange}
          placeholder="Type and press Enter"
          helperText="Separate multiple titles with commas or press Enter."
          removeLabelPrefix="Remove"
        />
      </div>
    </div>
  );
}
