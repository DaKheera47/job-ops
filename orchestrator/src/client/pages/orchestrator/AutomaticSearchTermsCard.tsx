import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { AutomaticChoiceCardGroup } from "./AutomaticChoiceCardGroup";
import {
  type AutomaticPresetId,
  type AutomaticPresetSelection,
  parseSearchTermsInput,
} from "./automatic-run";
import { TokenizedInput } from "./TokenizedInput";

interface AutomaticSearchTermsCardProps {
  selectedPreset: AutomaticPresetSelection;
  searchTerms: string[];
  searchTermDraft: string;
  onApplyPreset: (presetId: AutomaticPresetId) => void;
  onSelectCustomPreset: () => void;
  onSearchTermDraftChange: (value: string) => void;
  onSearchTermsChange: (value: string[]) => void;
}

export function AutomaticSearchTermsCard({
  selectedPreset,
  searchTerms,
  searchTermDraft,
  onApplyPreset,
  onSelectCustomPreset,
  onSearchTermDraftChange,
  onSearchTermsChange,
}: AutomaticSearchTermsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold text-muted-foreground">
            1
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>What roles are you looking for?</CardTitle>
            <CardDescription>
              Add the titles a job board would recognise. Alternatives widen
              coverage.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
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

        <div className="flex flex-col gap-3">
          <Label>Search depth</Label>
          <AutomaticChoiceCardGroup
            ariaLabel="Search depth"
            value={selectedPreset}
            columns={4}
            options={[
              {
                value: "fast",
                label: "Fast",
                description: "A quicker first pass.",
              },
              {
                value: "balanced",
                label: "Balanced",
                description: "Strong everyday coverage.",
              },
              {
                value: "detailed",
                label: "Detailed",
                description: "Broader, deeper discovery.",
              },
              {
                value: "custom",
                label: "Custom",
                description: "Keep your own run settings.",
              },
            ]}
            onValueChange={(preset) => {
              if (preset === "custom") onSelectCustomPreset();
              else onApplyPreset(preset as AutomaticPresetId);
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
