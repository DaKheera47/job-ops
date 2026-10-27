import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      <CardHeader>
        <div className="flex items-start gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold text-muted-foreground">
            3
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle>What should Job Ops prioritise?</CardTitle>
            <CardDescription>
              These instructions affect ranking, not discovery. Write them in
              plain English.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
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
          Applied to scoring for this search only.
        </p>
      </CardContent>
    </Card>
  );
}
