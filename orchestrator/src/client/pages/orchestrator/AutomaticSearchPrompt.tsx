import { useUiTranslation } from "@client/lib/i18n/language";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SEARCH_PROMPT_EXAMPLES = [
  {
    label: "Backend roles",
    prompt:
      "Backend engineering jobs in Manchester. Prefer TypeScript or Python and hybrid or remote roles.",
  },
  {
    label: "Graduate jobs",
    prompt:
      "Graduate software engineering jobs in Manchester. Prefer backend or API work and hybrid or remote roles.",
  },
  {
    label: "Paid internships",
    prompt:
      "Paid data analyst internships in the UK. Prefer roles using SQL, Python, or dashboards.",
  },
];

interface AutomaticSearchPromptProps {
  searchPrompt: string;
  isPlanningSearch: boolean;
  onSearchPromptChange: (value: string) => void;
  onGenerateSearchPlan: () => void;
  onConfigureManually: () => void;
}

export function AutomaticSearchPrompt({
  searchPrompt,
  isPlanningSearch,
  onSearchPromptChange,
  onGenerateSearchPlan,
  onConfigureManually,
}: AutomaticSearchPromptProps) {
  const { t: uiT } = useUiTranslation();
  return (
    <div className="flex w-full flex-col">
      <header className="mb-6 space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {uiT("Find your next role")}
        </h1>
        <p className="max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
          {uiT(
            "Tell us what you’re looking for. We’ll prepare a search you can review.",
          )}
        </p>
      </header>

      <Label htmlFor="search-plan-prompt" className="mb-2">
        {uiT("What kind of jobs are you looking for?")}
      </Label>
      <Textarea
        id="search-plan-prompt"
        value={searchPrompt}
        onChange={(event) => onSearchPromptChange(event.target.value)}
        placeholder={uiT(
          "Backend roles in Manchester. Hybrid or remote, using TypeScript or Python.",
        )}
        className="min-h-36 resize-y rounded-lg bg-background px-4 py-3 text-base leading-7 shadow-none"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{uiT("Try:")}</span>
        {SEARCH_PROMPT_EXAMPLES.map((example) => (
          <Button
            key={example.label}
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs font-normal"
            disabled={isPlanningSearch}
            onClick={() => onSearchPromptChange(uiT(example.prompt))}
          >
            {uiT(example.label)}
          </Button>
        ))}
      </div>

      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          className="h-11 w-full gap-2 sm:w-auto"
          disabled={isPlanningSearch || searchPrompt.trim().length === 0}
          onClick={onGenerateSearchPlan}
        >
          {isPlanningSearch ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : null}
          {isPlanningSearch
            ? uiT("Building your search…")
            : uiT("Build my search")}
          {!isPlanningSearch ? <ArrowRight className="h-4 w-4" /> : null}
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-auto px-0 text-sm text-muted-foreground"
          disabled={isPlanningSearch}
          onClick={onConfigureManually}
        >
          {uiT("Enter search details instead")}
        </Button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {uiT("Nothing runs until you start the search.")}
      </p>
    </div>
  );
}
