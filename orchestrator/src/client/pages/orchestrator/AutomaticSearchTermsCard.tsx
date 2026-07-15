import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <PresetOption
              id="fast"
              label="Fast"
              description="A quicker first pass."
              selected={selectedPreset === "fast"}
              onSelect={() => onApplyPreset("fast")}
            />
            <PresetOption
              id="balanced"
              label="Balanced"
              description="Strong everyday coverage."
              selected={selectedPreset === "balanced"}
              onSelect={() => onApplyPreset("balanced")}
            />
            <PresetOption
              id="detailed"
              label="Detailed"
              description="Broader, deeper discovery."
              selected={selectedPreset === "detailed"}
              onSelect={() => onApplyPreset("detailed")}
            />
            <PresetOption
              id="custom"
              label="Custom"
              description="Keep your own run settings."
              selected={selectedPreset === "custom"}
              onSelect={onSelectCustomPreset}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PresetOption({
  id,
  label,
  description,
  selected,
  onSelect,
}: {
  id: AutomaticPresetSelection;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      aria-label={label}
      aria-pressed={selected}
      data-preset={id}
      className="h-auto min-h-20 flex-col items-start justify-start gap-1 whitespace-normal p-3 text-left"
      onClick={onSelect}
    >
      <span className="font-semibold">{label}</span>
      <span className="text-xs font-normal opacity-75">{description}</span>
    </Button>
  );
}
