import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Ranking preferences</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="scoring-instructions" className="sr-only">
          Ranking preferences
        </Label>
        <Textarea
          id="scoring-instructions"
          value={scoringInstructions}
          onChange={(event) => onScoringInstructionsChange(event.target.value)}
          placeholder="e.g. Prefer roles above GBP 60k, lower-score graduate programmes, prioritize backend API work and visa sponsorship."
          className="min-h-28 resize-y"
          maxLength={4000}
        />
        <p className="text-sm leading-6 text-muted-foreground">
          These preferences are sent to scoring for this search only.
        </p>
      </CardContent>
    </Card>
  );
}
