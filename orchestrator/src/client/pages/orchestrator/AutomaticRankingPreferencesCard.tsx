import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface AutomaticRankingPreferencesCardProps {
  scoringInstructions: string;
  onScoringInstructionsChange: (value: string) => void;
}

export function AutomaticRankingPreferencesCard({
  scoringInstructions,
  onScoringInstructionsChange,
}: AutomaticRankingPreferencesCardProps) {
  return (
    <div className="flex flex-col gap-2 pb-2">
      <Label htmlFor="scoring-instructions">Your ideal role</Label>
      <Textarea
        id="scoring-instructions"
        aria-label="Ranking preferences"
        value={scoringInstructions}
        onChange={(event) => onScoringInstructionsChange(event.target.value)}
        placeholder="For example: Prioritise backend API work, visa sponsorship and roles above £40k."
        className="min-h-28 resize-y"
        maxLength={4000}
      />
      <p className="text-xs leading-5 text-muted-foreground">
        Preferences affect ranking; they do not exclude jobs.
      </p>
    </div>
  );
}
