import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Search terms</CardTitle>
      </CardHeader>
      <CardContent>
        <TokenizedInput
          id="search-terms-input"
          values={searchTerms}
          draft={searchTermDraft}
          parseInput={parseSearchTermsInput}
          onDraftChange={onSearchTermDraftChange}
          onValuesChange={onSearchTermsChange}
          placeholder="Type and press Enter"
          helperText="Add multiple terms by separating with commas or pressing Enter."
          removeLabelPrefix="Remove"
        />
      </CardContent>
    </Card>
  );
}
