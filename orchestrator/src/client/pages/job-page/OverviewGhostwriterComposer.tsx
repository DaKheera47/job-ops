import type { Job } from "@shared/types.js";
import { Send, Sparkles } from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const getGhostwriterSuggestions = (job: Job, hasNotes: boolean) => [
  hasNotes
    ? "Summarize the latest interview notes."
    : "What should I remember if a recruiter calls?",
  `What should I know before speaking with ${job.employer}?`,
];

type OverviewGhostwriterComposerProps = {
  job: Job;
  baseJobPath: string;
  hasNotes: boolean;
  navigationState?: { jobPageBackTo: string };
};

export const OverviewGhostwriterComposer: React.FC<
  OverviewGhostwriterComposerProps
> = ({ job, baseJobPath, hasNotes, navigationState }) => {
  const navigate = useNavigate();
  const [prompt, setPrompt] = React.useState("");
  const suggestions = React.useMemo(
    () => getGhostwriterSuggestions(job, hasNotes),
    [hasNotes, job],
  );

  const submitPrompt = React.useCallback(() => {
    const content = prompt.trim();
    if (!content) return;
    navigate(
      `${baseJobPath}/ghostwriter?prompt=${encodeURIComponent(content)}`,
      { state: navigationState },
    );
  }, [baseJobPath, navigate, navigationState, prompt]);

  return (
    <section className="rounded-xl border border-border/50 bg-card/85 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-1.5 h-4 w-4 shrink-0 text-primary" />
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitPrompt();
            }
          }}
          placeholder="Ask Ghostwriter anything about this application..."
          className="min-h-[30px] resize-none border-0 bg-transparent px-0 py-1 text-xs shadow-none focus-visible:ring-0 md:text-sm"
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/50">
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((suggestion) => (
            <Button
              key={suggestion}
              type="button"
              size="sm"
              variant="outline"
              className="hidden h-auto text-left md:inline-flex md:px-3 md:py-1.5"
              onClick={() => setPrompt(suggestion)}
            >
              {suggestion}
            </Button>
          ))}
        </div>

        <Button
          size="sm"
          onClick={submitPrompt}
          disabled={!prompt.trim()}
          className="mt-3"
        >
          <Send className="mr-1.5 h-3.5 w-3.5" />
          Go
        </Button>
      </div>
    </section>
  );
};
