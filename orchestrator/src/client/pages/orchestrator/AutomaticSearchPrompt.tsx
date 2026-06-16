import { Info, Loader2, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const SEARCH_PROMPT_EXAMPLES = [
  {
    label: "Masters placement",
    prompt:
      "Masters placement roles in software engineering, data, or QA. Prefer Manchester, Sheffield, Leeds, or remote. Visa-friendly is important. Avoid unpaid roles.",
  },
  {
    label: "Graduate software engineer",
    prompt:
      "Graduate software engineering jobs in Manchester above GBP 60k. Surface backend/API roles, lower-score generic graduate programmes, and prefer hybrid or remote options.",
  },
  {
    label: "Data analyst internship",
    prompt:
      "Data analyst internships in the UK. Prefer paid roles using SQL, Python, or dashboards. Rank remote-friendly and visa-friendly employers higher.",
  },
  {
    label: "Visa-friendly roles",
    prompt:
      "Software roles from visa-friendly employers. Prioritize backend TypeScript, platform engineering, or API work. Avoid unpaid roles and roles below GBP 45k.",
  },
];

interface AutomaticSearchPromptProps {
  searchPrompt: string;
  isPlanningSearch: boolean;
  planSummary: string | null;
  planWarnings: string[];
  planSource: "ai" | "fallback" | null;
  onSearchPromptChange: (value: string) => void;
  onGenerateSearchPlan: () => void;
  onConfigureManually: () => void;
}

export function AutomaticSearchPrompt({
  searchPrompt,
  isPlanningSearch,
  planSummary,
  planWarnings,
  planSource,
  onSearchPromptChange,
  onGenerateSearchPlan,
  onConfigureManually,
}: AutomaticSearchPromptProps) {
  return (
    <div className="mx-auto flex w-full max-w-[40rem] flex-col">
      <div className="mb-7 space-y-3 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
          Search composer
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          What kind of jobs are you looking for?
        </h1>
        <p className="mx-auto max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
          Describe the roles you want. Job Ops will turn that into search terms,
          sources, filters, and ranking rules before anything runs.
        </p>
      </div>

      <Label htmlFor="search-plan-prompt" className="sr-only">
        What kind of jobs are you looking for?
      </Label>
      <Textarea
        id="search-plan-prompt"
        value={searchPrompt}
        onChange={(event) => onSearchPromptChange(event.target.value)}
        placeholder="Example: Software engineering jobs in Manchester above GBP 60k. Prefer backend/API work, hybrid or remote roles, and visa-friendly employers. Lower-score generic graduate programmes."
        className="min-h-48 resize-none rounded-lg border-border/70 bg-background/35 px-4 py-4 text-base leading-7 shadow-none placeholder:text-muted-foreground/75 focus-visible:ring-1 focus-visible:ring-primary/70"
      />

      <div className="mt-5 space-y-2">
        <p className="text-sm text-muted-foreground">Try these examples</p>
        <div className="flex flex-wrap gap-2">
          {SEARCH_PROMPT_EXAMPLES.map((example) => (
            <Button
              key={example.label}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2 rounded-md border-border/70 bg-background/35 px-3 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => onSearchPromptChange(example.prompt)}
            >
              <Search className="h-3.5 w-3.5" />
              {example.label}
            </Button>
          ))}
        </div>
      </div>

      <Button
        type="button"
        className="mt-6 h-11 w-full gap-2"
        disabled={isPlanningSearch || searchPrompt.trim().length === 0}
        onClick={onGenerateSearchPlan}
      >
        {isPlanningSearch ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Sparkles className="h-4 w-4" />
        )}
        {isPlanningSearch ? "Generating search..." : "Generate search"}
      </Button>

      <Button
        type="button"
        variant="link"
        className="mx-auto mt-3 h-auto px-0 text-sm text-primary/80 underline-offset-4"
        onClick={onConfigureManually}
      >
        Configure manually
      </Button>

      <div className="mt-7 flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        <span>
          You'll review the generated settings before running the search.
        </span>
      </div>

      {planSummary ? (
        <Alert className="mt-5 border-border/70 bg-card/70 text-left">
          <Info className="h-4 w-4" />
          <AlertTitle>
            {planSource === "fallback"
              ? "Current settings kept"
              : "Search settings ready"}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{planSummary}</p>
            {planWarnings.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5">
                {planWarnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
